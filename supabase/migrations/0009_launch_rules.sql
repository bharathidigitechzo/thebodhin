-- 0009_launch_rules.sql — rules the app enforces, now also enforced by the database (see apps/student/src/core/business.ts subGate).
-- 1) Subscription gate: trial ended / plan ended / unpaid after 7-day grace → academy LOCKED.
--    Locked: no new content, enrolments, live classes or growth tools. Nothing is deleted; enrolled learners keep their courses.
-- 2) Module switches: the owner can switch optional modules off (data kept).
-- 3) Recording retention (Super Admin): how long class recordings stay viewable.
-- 4) settle_subscriptions(): nightly job — a plan booked during the trial starts when the trial ends.
-- Safe to run more than once.

alter table public.tenants add column if not exists disabled_modules text[] not null default '{}';
alter table public.platform_config add column if not exists recording_retention_days int not null default 180
  check (recording_retention_days = 0 or recording_retention_days between 30 and 1095);
alter table public.platform_config add column if not exists renewal_grace_days int not null default 7 check (renewal_grace_days between 0 and 30);

-- Same states as subGate() in the app.
create or replace function public.tenant_gate(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.tenant_subscriptions; grace int; ended boolean;
begin
  if p_tenant = public.bodhin_tenant() then return jsonb_build_object('state', 'active', 'locked', false); end if;
  select * into s from public.tenant_subscriptions where tenant_id = p_tenant;
  if not found then return jsonb_build_object('state', 'active', 'locked', false); end if;
  select renewal_grace_days into grace from public.platform_config where id = 1;
  ended := now() >= s.period_end;
  if s.status = 'trialing' then
    return case when ended then jsonb_build_object('state', 'trial_ended', 'locked', true) else jsonb_build_object('state', 'trial', 'locked', false) end;
  elsif s.status = 'cancelled' then
    return jsonb_build_object('state', case when ended then 'locked' else 'active' end, 'locked', ended);
  elsif s.status = 'past_due' or (s.status = 'active' and ended) then
    return case when now() < s.period_end + make_interval(days => coalesce(grace, 7))
      then jsonb_build_object('state', 'grace', 'locked', false) else jsonb_build_object('state', 'locked', 'locked', true) end;
  end if;
  return jsonb_build_object('state', 'active', 'locked', false);
end $$;

create or replace function public.tenant_locked(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select (public.tenant_gate(p_tenant) ->> 'locked')::boolean; $$;

-- Feature check used by every rule: plan (+ add-ons, overrides) AND module switched on AND academy not locked.
create or replace function public.tenant_has(p_tenant uuid, p_feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.tenant_entitlements(p_tenant) -> 'features' ? p_feature)
     and not (p_feature = any (coalesce((select disabled_modules from public.tenants where id = p_tenant), '{}')))
     and not public.tenant_locked(p_tenant);
$$;

-- New enrolments pause while locked (enrolled learners keep access; this only blocks NEW ones).
create or replace function public.enrol_block(p_tenant uuid, p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare lim int; already boolean;
begin
  if (select status from public.tenants where id = p_tenant) = 'suspended' then
    return 'This academy is not accepting new enrolments right now.';
  end if;
  if public.tenant_locked(p_tenant) then
    return 'This academy isn’t taking new enrolments right now. Please check back soon.';
  end if;
  select exists (select 1 from public.enrollments where tenant_id = p_tenant and user_id = p_user and (valid_till is null or valid_till > now())) into already;
  if already then return null; end if;
  lim := (public.tenant_entitlements(p_tenant) ->> 'students')::int;
  if lim is not null and public.active_students(p_tenant) >= lim then
    return 'This academy isn’t taking new enrolments right now. Please try again later.';
  end if;
  return null;
end $$;

-- Locked academies can't create or change content (reads still work; Bodhin staff can always act).
create or replace function public.guard_unlocked() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  if TG_TABLE_NAME in ('modules', 'lessons') then
    select c.tenant_id into t from public.courses c where c.id = coalesce(new.course_id, old.course_id);
  else
    t := coalesce(new.tenant_id, old.tenant_id);
  end if;
  if t is not null and public.tenant_locked(t) and not public.is_staff() then
    raise exception 'Your free trial or plan has ended. Choose a plan to keep teaching. Nothing has been deleted.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare tb text;
begin
  foreach tb in array array['courses', 'modules', 'lessons', 'live_sessions', 'coupons'] loop
    execute format('drop trigger if exists guard_unlocked on public.%I', tb);
    execute format('create trigger guard_unlocked before insert or update on public.%I for each row execute function public.guard_unlocked()', tb);
  end loop;
end $$;

-- Owner switches a module on/off. Can't switch on what the plan doesn't include.
create or replace function public.set_module(p_tenant uuid, p_module text, p_on boolean) returns text[]
language plpgsql security definer set search_path = '' as $$
declare cur text[];
begin
  if not public.is_tenant_owner(p_tenant) then raise exception 'Only the academy owner can change modules.' using errcode = '42501'; end if;
  if p_module in ('courses', 'recorded_video') then raise exception 'Courses and video are always on.' using errcode = 'P0001'; end if;
  if p_on and not (public.tenant_entitlements(p_tenant) -> 'features' ? p_module) then
    raise exception 'This module isn’t in your plan. Upgrade in Subscription & usage.' using errcode = 'P0001';
  end if;
  update public.tenants
     set disabled_modules = case when p_on then array_remove(disabled_modules, p_module)
                                 else array(select distinct unnest(disabled_modules || p_module)) end
   where id = p_tenant returning disabled_modules into cur;
  insert into public.audit_log (actor_id, action, target_kind, target_id, summary)
  values (auth.uid(), case when p_on then 'module.on' else 'module.off' end, 'tenant', p_tenant::text, p_module || case when p_on then ' switched on' else ' switched off' end);
  return cur;
end $$;
grant execute on function public.set_module(uuid, text, boolean) to authenticated;

-- Recording window for a finished class (0 = keep forever).
create or replace function public.recording_available(p_ends_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when d = 0 then true else now() < p_ends_at + make_interval(days => d) end
    from (select recording_retention_days d from public.platform_config where id = 1) x;
$$;

-- Nightly job (pg_cron: select cron.schedule('settle-subs', '15 0 * * *', 'select public.settle_subscriptions()');):
-- a plan booked during the trial starts when the trial ends. Paid renewals are driven by the payment gateway webhook.
create or replace function public.settle_subscriptions() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in select * from public.tenant_subscriptions where status = 'trialing' and period_end <= now() and pending is not null loop
    update public.tenant_subscriptions
       set plan = r.pending ->> 'plan', billing = coalesce(r.pending ->> 'billing', 'monthly'), status = 'active', pending = null,
           period_end = now() + case when coalesce(r.pending ->> 'billing', 'monthly') = 'annual' then interval '365 days' else interval '30 days' end,
           updated_at = now()
     where tenant_id = r.tenant_id;
    n := n + 1;
  end loop;
  return n;
end $$;
