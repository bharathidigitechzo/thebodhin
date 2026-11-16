-- 0007 · Growth tools (Nrich / Graphy parity, round 1)
-- Leads CRM · automations · broadcasts · EMI · webinars · 1:1 bookings · digital products · website builder · community.
-- Every table carries tenant_id, every rule is checked here (RLS + security-definer functions), so the app can't bypass them.
-- Nothing existing is changed except: plan feature lists gain the new tool keys (prices and limits stay exactly as in the pricing document).

/* ───────────── plan features (Super Admin can still edit per plan / per tenant) ───────────── */
update public.plans set features = (select array_agg(distinct f) from unnest(features || array['digital_products','bookings','website']) f) where id in ('starter','creator','growth','institute','enterprise');
update public.plans set features = (select array_agg(distinct f) from unnest(features || array['webinars','community','broadcast']) f) where id in ('creator','growth','institute','enterprise');
update public.plans set features = (select array_agg(distinct f) from unnest(features || array['crm','automations','emi','website_pro']) f) where id in ('growth','institute','enterprise');

/* ───────────── helpers ───────────── */
create or replace function public.is_tenant_staff(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_tenant_role(p_tenant, array['owner','tutor']);
$$;
create or replace function public.is_tenant_owner(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_tenant_role(p_tenant, array['owner']);
$$;
create or replace function public.is_tenant_learner(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments e where e.user_id = auth.uid() and e.tenant_id = p_tenant and (e.valid_till is null or e.valid_till > now()));
$$;
create or replace function public.norm_phone(p text) returns text language sql immutable as $$
  select case when d ~ '^[6-9][0-9]{9}$' then d end
  from (select regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^91(?=[0-9]{10}$)', ''), '^0(?=[0-9]{10}$)', '') d) x;
$$;
create or replace function public.need_feature(p_tenant uuid, p_feature text, p_msg text) returns void
language plpgsql stable as $$
begin
  if not public.tenant_has(p_tenant, p_feature) then raise exception '%', p_msg using errcode = 'P0001'; end if;
end $$;

/* ───────────── Leads CRM ───────────── */
create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  name            text not null check (length(trim(name)) between 2 and 80),
  phone           text not null check (phone ~ '^[6-9][0-9]{9}$'),
  email           text check (email is null or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  course_id       uuid references public.courses(id) on delete set null,
  source          text not null check (source in ('website','webinar','referral','ads','walk_in','phone','other')),
  stage           text not null default 'new' check (stage in ('new','contacted','demo','won','lost')),
  lost_reason     text,
  next_follow_up  timestamptz,
  demo_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, phone),
  check (stage <> 'lost' or lost_reason is not null)
);
create table public.lead_notes (
  id       uuid primary key default gen_random_uuid(),
  lead_id  uuid not null references public.leads(id) on delete cascade,
  author   uuid references public.profiles(id),
  text     text not null check (length(text) between 1 and 500),
  at       timestamptz not null default now()
);
create index leads_due_idx on public.leads (tenant_id, next_follow_up) where stage not in ('won','lost');

/** Public enquiry form on the tutor site (anon allowed). Same phone = same lead; a lost lead re-opens. */
create or replace function public.submit_lead(p_slug text, p_name text, p_phone text, p_email text, p_course uuid, p_source text default 'website') returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; ph text := public.norm_phone(p_phone); id_ uuid;
begin
  select id into t from public.tenants where slug = p_slug and status = 'active';
  if t is null then raise exception 'This form is closed.' using errcode = 'P0002'; end if;
  perform public.need_feature(t, 'crm', 'This form is closed.');
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter your name.' using errcode = '22023'; end if;
  if ph is null then raise exception 'Enter a valid 10-digit mobile number.' using errcode = '22023'; end if;
  if p_course is not null and not exists (select 1 from public.courses where id = p_course and tenant_id = t) then p_course := null; end if;
  insert into public.leads (tenant_id, name, phone, email, course_id, source, next_follow_up)
  values (t, trim(p_name), ph, nullif(trim(p_email), ''), p_course, p_source, now() + interval '2 hours')
  on conflict (tenant_id, phone) do update set updated_at = now(), stage = case when leads.stage = 'lost' then 'new' else leads.stage end, lost_reason = case when leads.stage = 'lost' then null else leads.lost_reason end
  returning id into id_;
  insert into public.lead_notes (lead_id, text) values (id_, 'Enquiry via ' || p_source);
  return id_;
end $$;
grant execute on function public.submit_lead(text, text, text, text, uuid, text) to anon, authenticated;

alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;
create policy "staff read leads"   on public.leads for select using (public.is_tenant_staff(tenant_id) and public.tenant_has(tenant_id, 'crm'));
create policy "staff write leads"  on public.leads for insert with check (public.is_tenant_staff(tenant_id) and public.tenant_has(tenant_id, 'crm'));
create policy "staff update leads" on public.leads for update using (public.is_tenant_staff(tenant_id) and public.tenant_has(tenant_id, 'crm'));
create policy "owner delete leads" on public.leads for delete using (public.is_tenant_owner(tenant_id));
create policy "staff notes" on public.lead_notes for all using (exists (select 1 from public.leads l where l.id = lead_id and public.is_tenant_staff(l.tenant_id))) with check (exists (select 1 from public.leads l where l.id = lead_id and public.is_tenant_staff(l.tenant_id)) and author = auth.uid());

/* ───────────── Automations, broadcasts, outbox ───────────── */
create table public.automations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  trigger    text not null check (trigger in ('enrolled','class_tomorrow','fee_due','fee_overdue','checkout_abandoned','course_completed','lead_created','inactive_7d','webinar_registered','booking_confirmed')),
  channel    text not null default 'both' check (channel in ('email','push','both')),
  subject    text not null check (length(subject) between 1 and 120),
  body       text not null check (length(body) between 5 and 1000),
  enabled    boolean not null default false,
  sent       int not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, trigger)
);
create table public.broadcasts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  created_by    uuid not null references public.profiles(id),
  title         text not null check (length(title) between 1 and 120),
  body          text not null check (length(body) between 5 and 1000),
  channel       text not null check (channel in ('email','push','both')),
  audience      jsonb not null,
  marketing     boolean not null default false,
  status        text not null default 'scheduled' check (status in ('scheduled','sent','cancelled')),
  scheduled_at  timestamptz not null default now(),
  sent_at       timestamptz,
  recipients    int not null default 0,
  skipped_opt_out int not null default 0,
  created_at    timestamptz not null default now()
);
-- Delivery queue drained by a worker (email provider + Expo push). Written by the server only.
create table public.message_outbox (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  to_user     uuid references public.profiles(id) on delete cascade,
  to_email    text,
  channel     text not null check (channel in ('email','push')),
  subject     text not null,
  body        text not null,
  source_kind text not null check (source_kind in ('automation','broadcast')),
  source_id   text not null,
  status      text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  created_at  timestamptz not null default now(),
  unique (source_kind, source_id, channel, to_user, to_email)
);

create or replace function public.broadcast_rules() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_tenant_owner(new.tenant_id) then raise exception 'Only the workspace owner can send broadcasts.' using errcode = '42501'; end if;
  perform public.need_feature(new.tenant_id, 'broadcast', 'Broadcasts need the Creator plan.');
  if new.audience ->> 'kind' = 'leads' then perform public.need_feature(new.tenant_id, 'crm', 'Sending to leads needs the Growth plan (Leads CRM).'); end if;
  if new.scheduled_at < now() - interval '1 minute' then raise exception 'Schedule time is in the past.' using errcode = '22023'; end if;
  if (select count(*) from public.broadcasts where tenant_id = new.tenant_id and status <> 'cancelled' and created_at > date_trunc('day', now())) >= 5 then
    raise exception 'You can send 5 broadcasts a day. This keeps your emails out of spam folders.' using errcode = 'P0001';
  end if;
  new.created_by := auth.uid(); new.status := 'scheduled'; new.recipients := 0; new.sent_at := null;
  return new;
end $$;
create trigger broadcast_rules before insert on public.broadcasts for each row execute function public.broadcast_rules();

alter table public.automations enable row level security;
alter table public.broadcasts enable row level security;
alter table public.message_outbox enable row level security;
create policy "staff read automations" on public.automations for select using (public.is_tenant_staff(tenant_id));
create policy "owner edits automations" on public.automations for update using (public.is_tenant_owner(tenant_id) and public.tenant_has(tenant_id, 'automations')) with check (public.is_tenant_owner(tenant_id));
create policy "owner seeds automations" on public.automations for insert with check (public.is_tenant_owner(tenant_id) and public.tenant_has(tenant_id, 'automations'));
create policy "staff read broadcasts" on public.broadcasts for select using (public.is_tenant_staff(tenant_id));
create policy "owner creates broadcasts" on public.broadcasts for insert with check (public.is_tenant_owner(tenant_id));
create policy "owner cancels broadcasts" on public.broadcasts for update using (public.is_tenant_owner(tenant_id) and status = 'scheduled') with check (status in ('scheduled','cancelled'));
create policy "staff read outbox" on public.message_outbox for select using (public.is_tenant_staff(tenant_id));
-- no insert/update policy on outbox: only the server (service_role) writes it.

/* ───────────── EMI ───────────── */
create table public.emi_plans (
  course_id   uuid primary key references public.courses(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  parts       int not null check (parts in (2,3,4,6)),
  every_days  int not null check (every_days between 7 and 60),
  fee_pct     numeric(4,1) not null default 0 check (fee_pct between 0 and 15),
  grace_days  int not null default 7 check (grace_days between 0 and 30),
  enabled     boolean not null default true
);
create table public.emi_contracts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id),
  total_paise bigint not null check (total_paise > 0),
  status      text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at  timestamptz not null default now(),
  unique (user_id, course_id)
);
create table public.emi_instalments (
  contract_id uuid not null references public.emi_contracts(id) on delete cascade,
  n           int not null check (n between 1 and 6),
  amount_paise bigint not null check (amount_paise > 0),
  due_at      timestamptz not null,
  paid_at     timestamptz,
  order_id    uuid,
  primary key (contract_id, n)
);

create or replace function public.emi_plan_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare price bigint;
begin
  select price_paise into price from public.courses where id = new.course_id and tenant_id = new.tenant_id;
  if price is null then raise exception 'Course not found.' using errcode = 'P0002'; end if;
  if price < 200000 then raise exception 'EMI is for courses of ₹2,000 or more.' using errcode = '22023'; end if;
  perform public.need_feature(new.tenant_id, 'emi', 'EMI needs the Growth plan.');
  return new;
end $$;
create trigger emi_plan_rules before insert or update on public.emi_plans for each row execute function public.emi_plan_rules();

/** Build the schedule for a paid first instalment. Called by the payment webhook (service role) after instalment 1 succeeds. */
create or replace function public.emi_create(p_user uuid, p_course uuid, p_price_paise bigint, p_first_order uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare pl public.emi_plans; total bigint; base bigint; id_ uuid; i int;
begin
  select * into pl from public.emi_plans where course_id = p_course and enabled;
  if not found then raise exception 'EMI is not available for this course.' using errcode = 'P0001'; end if;
  total := round(p_price_paise * (1 + pl.fee_pct / 100.0) / 100.0) * 100;   -- whole rupees
  base := floor(total / pl.parts / 100.0) * 100;
  insert into public.emi_contracts (tenant_id, user_id, course_id, total_paise) values (pl.tenant_id, p_user, p_course, total) returning id into id_;
  for i in 1..pl.parts loop
    insert into public.emi_instalments (contract_id, n, amount_paise, due_at, paid_at, order_id)
    values (id_, i, case when i = 1 then total - base * (pl.parts - 1) else base end, now() + make_interval(days => (i - 1) * pl.every_days), case when i = 1 then now() end, case when i = 1 then p_first_order end);
  end loop;
  return id_;
end $$;
revoke execute on function public.emi_create(uuid, uuid, bigint, uuid) from public, anon, authenticated;

/** Lessons check: false only when an instalment is more than grace_days late. Progress is never deleted. */
create or replace function public.emi_access_ok(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.emi_contracts c join public.emi_instalments i on i.contract_id = c.id join public.emi_plans p on p.course_id = c.course_id
    where c.user_id = auth.uid() and c.course_id = p_course and c.status = 'active' and i.paid_at is null and i.due_at < now() - make_interval(days => p.grace_days));
$$;
grant execute on function public.emi_access_ok(uuid) to authenticated;

alter table public.emi_plans enable row level security;
alter table public.emi_contracts enable row level security;
alter table public.emi_instalments enable row level security;
create policy "anyone reads emi plans" on public.emi_plans for select using (enabled or public.is_tenant_staff(tenant_id));
create policy "owner sets emi plans" on public.emi_plans for all using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));
create policy "own or staff contracts" on public.emi_contracts for select using (user_id = auth.uid() or public.is_tenant_staff(tenant_id));
create policy "own or staff instalments" on public.emi_instalments for select using (exists (select 1 from public.emi_contracts c where c.id = contract_id and (c.user_id = auth.uid() or public.is_tenant_staff(c.tenant_id))));
-- contracts/instalments are written only by emi_create and the payment webhook.

/* ───────────── Webinars ───────────── */
create table public.webinars (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  title         text not null check (length(trim(title)) between 5 and 120),
  description   text not null default '',
  starts_at     timestamptz not null,
  duration_min  int not null check (duration_min between 15 and 240),
  price_paise   bigint not null default 0 check (price_paise = 0 or price_paise between 4900 and 999900),
  capacity      int not null check (capacity between 10 and 1000),
  pitch_course  uuid references public.courses(id) on delete set null,
  status        text not null default 'draft' check (status in ('draft','published','ended','cancelled')),
  replay        boolean not null default true,
  created_at    timestamptz not null default now()
);
create table public.webinar_registrations (
  webinar_id uuid not null references public.webinars(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  name       text not null,
  email      text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  phone      text,
  order_id   uuid,
  attended   boolean not null default false,
  at         timestamptz not null default now(),
  primary key (webinar_id, email)
);
create or replace function public.webinar_rules() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.need_feature(new.tenant_id, 'webinars', 'Webinars need the Creator plan.');
  if tg_op = 'INSERT' and new.starts_at < now() + interval '15 minutes' then raise exception 'Start time must be at least 15 minutes from now.' using errcode = '22023'; end if;
  return new;
end $$;
create trigger webinar_rules before insert or update on public.webinars for each row execute function public.webinar_rules();

/** Free registration (paid ones are inserted by the payment webhook with the order id). Locks the row so seats never oversell. */
create or replace function public.webinar_register(p_webinar uuid, p_name text, p_email text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare w public.webinars; taken int;
begin
  select * into w from public.webinars where id = p_webinar for update;
  if not found or w.status <> 'published' then raise exception 'This webinar is not available.' using errcode = 'P0002'; end if;
  if now() > w.starts_at + make_interval(mins => w.duration_min) then raise exception 'Registration is closed.' using errcode = 'P0001'; end if;
  if w.price_paise > 0 then raise exception 'This is a paid webinar — complete payment to register.' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter your name.' using errcode = '22023'; end if;
  if exists (select 1 from public.webinar_registrations where webinar_id = p_webinar and email = lower(trim(p_email))) then raise exception 'You are already registered.' using errcode = 'P0001'; end if;
  select count(*) into taken from public.webinar_registrations where webinar_id = p_webinar;
  if taken >= w.capacity then raise exception 'All seats are taken.' using errcode = 'P0001'; end if;
  if p_phone is not null and public.norm_phone(p_phone) is null then raise exception 'Enter a valid 10-digit mobile number.' using errcode = '22023'; end if;
  insert into public.webinar_registrations (webinar_id, user_id, name, email, phone) values (p_webinar, auth.uid(), trim(p_name), lower(trim(p_email)), public.norm_phone(p_phone));
exception when unique_violation then raise exception 'You are already registered.' using errcode = 'P0001';
end $$;
grant execute on function public.webinar_register(uuid, text, text, text) to anon, authenticated;

alter table public.webinars enable row level security;
alter table public.webinar_registrations enable row level security;
create policy "public reads published webinars" on public.webinars for select using (status in ('published','ended') or public.is_tenant_staff(tenant_id));
create policy "owner manages webinars" on public.webinars for all using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));
create policy "own or staff registrations" on public.webinar_registrations for select using (user_id = auth.uid() or exists (select 1 from public.webinars w where w.id = webinar_id and public.is_tenant_staff(w.tenant_id)));

/* ───────────── 1:1 bookings ───────────── */
create table public.booking_offers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  title         text not null check (length(trim(title)) between 3 and 80),
  duration_min  int not null check (duration_min in (15,30,45,60)),
  price_paise   bigint not null default 0 check (price_paise = 0 or price_paise between 9900 and 4999900),
  weekly        jsonb not null check (jsonb_typeof(weekly) = 'array' and jsonb_array_length(weekly) between 1 and 21),
  buffer_min    int not null default 10 check (buffer_min between 0 and 60),
  notice_hours  int not null default 4 check (notice_hours between 0 and 72),
  horizon_days  int not null default 14 check (horizon_days between 1 and 60),
  active        boolean not null default true
);
create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  offer_id    uuid not null references public.booking_offers(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text not null default 'confirmed' check (status in ('confirmed','cancelled','done')),
  order_id    uuid,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index bookings_no_double on public.bookings (offer_id, starts_at) where status = 'confirmed';

create or replace function public.offer_rules() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.need_feature(new.tenant_id, 'bookings', '1:1 bookings are not on your plan.');
  return new;
end $$;
create trigger offer_rules before insert or update on public.booking_offers for each row execute function public.offer_rules();

/** Free slot booking (paid ones come through the payment webhook). Refuses overlaps including the buffer, short notice, and a second upcoming session. */
create or replace function public.book_slot(p_offer uuid, p_starts timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.booking_offers; e timestamptz; id_ uuid; dow int; hm int; ok boolean := false; w jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to book a session.' using errcode = '28000'; end if;
  select * into o from public.booking_offers where id = p_offer and active for update;
  if not found then raise exception 'This booking page is not available.' using errcode = 'P0002'; end if;
  if o.price_paise > 0 then raise exception 'This session is paid — complete payment to book.' using errcode = 'P0001'; end if;
  if p_starts < now() + make_interval(hours => o.notice_hours) then raise exception 'That slot is too soon. Pick a later time.' using errcode = 'P0001'; end if;
  if p_starts > now() + make_interval(days => o.horizon_days) then raise exception 'That date is not open yet.' using errcode = 'P0001'; end if;
  e := p_starts + make_interval(mins => o.duration_min);
  dow := extract(dow from p_starts at time zone 'Asia/Kolkata');
  hm := extract(hour from p_starts at time zone 'Asia/Kolkata') * 60 + extract(minute from p_starts at time zone 'Asia/Kolkata');
  for w in select * from jsonb_array_elements(o.weekly) loop
    if (w ->> 'day')::int = dow
       and hm >= split_part(w ->> 'from', ':', 1)::int * 60 + split_part(w ->> 'from', ':', 2)::int
       and hm + o.duration_min <= split_part(w ->> 'to', ':', 1)::int * 60 + split_part(w ->> 'to', ':', 2)::int then ok := true; end if;
  end loop;
  if not ok then raise exception 'The academy is not available at that time.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.bookings b where b.offer_id = p_offer and b.status = 'confirmed'
             and p_starts < b.ends_at + make_interval(mins => o.buffer_min) and e + make_interval(mins => o.buffer_min) > b.starts_at) then
    raise exception 'That slot was just taken. Pick another.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bookings b where b.offer_id = p_offer and b.user_id = auth.uid() and b.status = 'confirmed' and b.starts_at > now()) then
    raise exception 'You already have an upcoming session. Cancel it first to pick a new time.' using errcode = 'P0001';
  end if;
  insert into public.bookings (tenant_id, offer_id, user_id, starts_at, ends_at) values (o.tenant_id, p_offer, auth.uid(), p_starts, e) returning id into id_;
  return id_;
end $$;
grant execute on function public.book_slot(uuid, timestamptz) to authenticated;

create or replace function public.cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or b.status <> 'confirmed' then raise exception 'Booking not found.' using errcode = 'P0002'; end if;
  if public.is_tenant_staff(b.tenant_id) then null;
  elsif b.user_id = auth.uid() then
    if b.starts_at < now() + interval '12 hours' then raise exception 'Sessions can be cancelled up to 12 hours before.' using errcode = 'P0001'; end if;
  else raise exception 'Not allowed.' using errcode = '42501'; end if;
  update public.bookings set status = 'cancelled' where id = p_booking;
end $$;
grant execute on function public.cancel_booking(uuid) to authenticated;

alter table public.booking_offers enable row level security;
alter table public.bookings enable row level security;
create policy "public reads active offers" on public.booking_offers for select using (active or public.is_tenant_staff(tenant_id));
create policy "owner manages offers" on public.booking_offers for all using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));
create policy "own or staff bookings" on public.bookings for select using (user_id = auth.uid() or public.is_tenant_staff(tenant_id));

/* ───────────── Digital products ───────────── */
create table public.digital_products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  title           text not null check (length(trim(title)) between 3 and 80),
  description     text not null default '',
  kind            text not null check (kind in ('ebook','notes','template','question_bank','recording','other')),
  price_paise     bigint not null default 0 check (price_paise = 0 or price_paise between 1900 and 1999900),
  download_limit  int not null default 5 check (download_limit between 1 and 20),
  status          text not null default 'draft' check (status in ('draft','published','archived')),
  created_at      timestamptz not null default now()
);
create table public.product_files (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.digital_products(id) on delete cascade,
  name        text not null,
  storage_key text not null,            -- private bucket path; never public
  size_mb     numeric(8,2) not null check (size_mb > 0 and size_mb <= 200)
);
create table public.product_purchases (
  product_id uuid not null references public.digital_products(id),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id),
  order_id   uuid,
  downloads  int not null default 0,
  at         timestamptz not null default now(),
  primary key (product_id, user_id)
);
create or replace function public.product_rules() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.need_feature(new.tenant_id, 'digital_products', 'Digital products are not on your plan.');
  if new.status = 'published' and tg_op = 'UPDATE' and not exists (select 1 from public.product_files where product_id = new.id) then
    raise exception 'Add at least one file before publishing.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger product_rules before insert or update on public.digital_products for each row execute function public.product_rules();
create or replace function public.product_file_cap() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.product_files where product_id = new.product_id) >= 10 then raise exception 'Up to 10 files per product.' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger product_file_cap before insert on public.product_files for each row execute function public.product_file_cap();

/** Claim a free product (paid ones: payment webhook inserts the purchase). */
create or replace function public.claim_free_product(p_product uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.digital_products;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into p from public.digital_products where id = p_product and status = 'published';
  if not found then raise exception 'This product is not available.' using errcode = 'P0002'; end if;
  if p.price_paise > 0 then raise exception 'Complete payment to get this product.' using errcode = 'P0001'; end if;
  insert into public.product_purchases (product_id, user_id, tenant_id) values (p_product, auth.uid(), p.tenant_id) on conflict do nothing;
end $$;
/** Returns the storage key the Edge Function signs for 10 minutes — only for buyers, within the download limit. */
create or replace function public.product_download(p_file uuid) returns text
language plpgsql security definer set search_path = public as $$
declare f public.product_files; p public.digital_products; pur public.product_purchases; nfiles int;
begin
  select * into f from public.product_files where id = p_file;
  if not found then raise exception 'File not found.' using errcode = 'P0002'; end if;
  select * into p from public.digital_products where id = f.product_id;
  select * into pur from public.product_purchases where product_id = p.id and user_id = auth.uid() for update;
  if not found then raise exception 'Buy this product to download it.' using errcode = '42501'; end if;
  select count(*) into nfiles from public.product_files where product_id = p.id;
  if pur.downloads >= p.download_limit * nfiles then raise exception 'Download limit reached. Contact the academy if you lost the file.' using errcode = 'P0001'; end if;
  update public.product_purchases set downloads = downloads + 1 where product_id = p.id and user_id = auth.uid();
  return f.storage_key;
end $$;
grant execute on function public.claim_free_product(uuid), public.product_download(uuid) to authenticated;

alter table public.digital_products enable row level security;
alter table public.product_files enable row level security;
alter table public.product_purchases enable row level security;
create policy "public reads published products" on public.digital_products for select using (status = 'published' or public.is_tenant_staff(tenant_id) or exists (select 1 from public.product_purchases x where x.product_id = id and x.user_id = auth.uid()));
create policy "owner manages products" on public.digital_products for all using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));
-- file rows (names/sizes) are visible to staff only; buyers get files through product_download()
create policy "staff reads files" on public.product_files for select using (exists (select 1 from public.digital_products p where p.id = product_id and public.is_tenant_staff(p.tenant_id)));
create policy "owner manages files" on public.product_files for all using (exists (select 1 from public.digital_products p where p.id = product_id and public.is_tenant_owner(p.tenant_id))) with check (exists (select 1 from public.digital_products p where p.id = product_id and public.is_tenant_owner(p.tenant_id)));
create policy "own or staff purchases" on public.product_purchases for select using (user_id = auth.uid() or public.is_tenant_staff(tenant_id));

/* ───────────── Website builder ───────────── */
create table public.sites (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  template    text not null default 'classic' check (template in ('classic','bold','minimal')),
  sections    jsonb not null check (jsonb_typeof(sections) = 'array' and octet_length(sections::text) <= 60000),
  seo_title   text not null check (length(trim(seo_title)) between 5 and 60),
  seo_desc    text not null default '' check (length(seo_desc) <= 160),
  ga4         text check (ga4 is null or ga4 ~ '^G-[A-Z0-9]{6,12}$'),
  meta_pixel  text check (meta_pixel is null or meta_pixel ~ '^[0-9]{15,16}$'),
  contact     jsonb not null default '{}',
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);
create or replace function public.site_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare pro boolean;
begin
  perform public.need_feature(new.tenant_id, 'website', 'The website is not on your plan.');
  pro := public.tenant_has(new.tenant_id, 'website_pro');
  if not pro and (new.ga4 is not null or new.meta_pixel is not null) then raise exception 'Analytics & pixel tracking need the Growth plan.' using errcode = 'P0001'; end if;
  if not pro and exists (select 1 from jsonb_array_elements(new.sections) s where (s ->> 'visible')::boolean and s ->> 'kind' in ('testimonials','faq','lead_form')) then
    raise exception 'Testimonials, FAQ and the enquiry form need the Growth plan.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from jsonb_array_elements(new.sections) s where s ->> 'kind' = 'hero' and (s ->> 'visible')::boolean) then
    raise exception 'Keep the hero banner visible.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger site_rules before insert or update on public.sites for each row execute function public.site_rules();

alter table public.sites enable row level security;
-- Public read of published sites (tracking ids are public by nature — they ship in the page HTML).
create policy "public reads published sites" on public.sites for select using (published or public.is_tenant_staff(tenant_id));
create policy "owner edits site" on public.sites for all using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id));

/* ───────────── Community ───────────── */
create table public.community_channels (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null check (length(trim(name)) between 2 and 40),
  course_id  uuid references public.courses(id) on delete cascade,
  announce   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create table public.community_posts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  channel_id  uuid not null references public.community_channels(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.community_posts(id) on delete cascade,
  text        text not null check (length(trim(text)) between 1 and 2000),
  pinned      boolean not null default false,
  hidden      boolean not null default false,
  at          timestamptz not null default now()
);
create table public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji   text not null check (emoji in ('👍','❤️','🎉','🙏','💡')),
  primary key (post_id, user_id, emoji)
);
create table public.community_reports (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (post_id, user_id)
);

create or replace function public.can_read_channel(p_channel uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_channels c
    where c.id = p_channel and public.tenant_has(c.tenant_id, 'community')
      and (public.is_tenant_staff(c.tenant_id)
           or (c.course_id is null and public.is_tenant_learner(c.tenant_id))
           or (c.course_id is not null and public.is_enrolled(c.course_id))));
$$;

create or replace function public.post_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare ch public.community_channels; staff boolean;
begin
  select * into ch from public.community_channels where id = new.channel_id;
  if ch.id is null or not public.can_read_channel(new.channel_id) then raise exception 'You can’t post in this channel.' using errcode = '42501'; end if;
  staff := public.is_tenant_staff(ch.tenant_id);
  new.tenant_id := ch.tenant_id; new.author_id := auth.uid(); new.at := now();
  if not staff then
    new.pinned := false; new.hidden := false;
    if ch.announce and new.parent_id is null then raise exception 'Only the academy posts here. You can reply and react.' using errcode = '42501'; end if;
    if (select count(*) from regexp_matches(new.text, 'https?://', 'g')) > 1 then raise exception 'Only one link per post, please.' using errcode = '22023'; end if;
    if new.text ~ '([0-9][\s-]?){10,}' then raise exception 'Please don’t post phone numbers in the community.' using errcode = '22023'; end if;
    if (select count(*) from public.community_posts where author_id = auth.uid() and at > now() - interval '1 minute') >= 5 then raise exception 'You’re posting fast — wait a minute.' using errcode = 'P0001'; end if;
  end if;
  if new.parent_id is not null and not exists (select 1 from public.community_posts where id = new.parent_id and channel_id = new.channel_id) then raise exception 'That post was removed.' using errcode = 'P0002'; end if;
  return new;
end $$;
create trigger post_rules before insert on public.community_posts for each row execute function public.post_rules();

-- 3 reports hide a post until staff review it.
create or replace function public.report_hide() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.community_reports where post_id = new.post_id) >= 3 then update public.community_posts set hidden = true where id = new.post_id; end if;
  return new;
end $$;
create trigger report_hide after insert on public.community_reports for each row execute function public.report_hide();

alter table public.community_channels enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_reports enable row level security;
create policy "members read channels" on public.community_channels for select using (public.can_read_channel(id));
create policy "owner manages channels" on public.community_channels for all using (public.is_tenant_owner(tenant_id)) with check (public.is_tenant_owner(tenant_id) and public.tenant_has(tenant_id, 'community'));
create policy "members read posts" on public.community_posts for select using (public.can_read_channel(channel_id) and (not hidden or public.is_tenant_staff(tenant_id) or author_id = auth.uid()));
create policy "members post" on public.community_posts for insert with check (public.can_read_channel(channel_id));
create policy "staff moderates" on public.community_posts for update using (public.is_tenant_staff(tenant_id));
create policy "author or staff deletes" on public.community_posts for delete using (author_id = auth.uid() or public.is_tenant_staff(tenant_id));
create policy "members react" on public.community_reactions for all using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from public.community_posts p where p.id = post_id and public.can_read_channel(p.channel_id)));
create policy "members read reactions" on public.community_reactions for select using (exists (select 1 from public.community_posts p where p.id = post_id and public.can_read_channel(p.channel_id)));
create policy "members report" on public.community_reports for insert with check (user_id = auth.uid() and exists (select 1 from public.community_posts p where p.id = post_id and p.author_id <> auth.uid() and public.can_read_channel(p.channel_id)));
create policy "staff reads reports" on public.community_reports for select using (exists (select 1 from public.community_posts p where p.id = post_id and public.is_tenant_staff(p.tenant_id)));

/* ───────────── Sales of non-course items (direct to tutor's gateway, no Bodhin commission) ───────────── */
create table public.growth_sales (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  user_id     uuid references public.profiles(id) on delete set null,
  kind        text not null check (kind in ('webinar','booking','product')),
  ref_id      uuid not null,
  amount_paise bigint not null check (amount_paise >= 0),
  invoice_no  text not null,
  gateway_ref text,
  at          timestamptz not null default now(),
  unique (gateway_ref)
);
alter table public.growth_sales enable row level security;
create policy "own or staff sales" on public.growth_sales for select using (user_id = auth.uid() or public.is_tenant_staff(tenant_id));
-- written only by the payment webhook (service role), which also inserts the registration / booking / purchase.

/* New workspaces get starter automations (off) and a default site — matches the app's defaults. */
create or replace function public.growth_defaults() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.community_channels (tenant_id, name, announce) values (new.id, 'Announcements', true), (new.id, 'General', false) on conflict do nothing;
  return new;
end $$;
create trigger growth_defaults after insert on public.tenants for each row execute function public.growth_defaults();
