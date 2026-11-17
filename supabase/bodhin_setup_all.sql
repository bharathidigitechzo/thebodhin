-- Bodhin — complete database setup (paste this whole file into Supabase → SQL Editor → Run).
-- Generated 2026-11-16. Contains: 0001_tables, 0002_rules, 0003_security, seed, 0004_refunds_and_listing, 0005_live, 0006_playground, 0007_growth, 0008_scale, 0009_launch_rules, 0010_academy_workflows. Run ONCE on a NEW project.
-- Already ran an older bodhin_setup_all.sql (Nov 6)? Then run ONLY migrations/0005_live.sql, 0006_playground.sql, 0007_growth.sql, 0008_scale.sql, 0009_launch_rules.sql and 0010_academy_workflows.sql, in that order.
-- Already ran the Nov 14 version? Then run ONLY migrations/0010_academy_workflows.sql.

-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · 0001 — tables
-- Money is stored in PAISE (bigint). ₹1 = 100 paise. Timestamps are UTC.
-- Run order: 0001_tables → 0002_rules → 0003_security → seed.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─────────────── Platform settings (single row each) ───────────────
create table public.plans (
  id                text primary key check (id in ('starter','creator','growth','institute','enterprise')),
  name              text not null,
  monthly_paise     bigint,              -- null = custom quote
  annual_paise      bigint,
  active_students   int,                 -- null = unlimited
  storage_gb        int,
  live_hours        int,
  tutor_seats       int,
  features          text[] not null default '{}',
  recommended       boolean not null default false,
  best_for          text not null default '',
  sort              int not null default 0
);

create table public.addons (
  kind              text primary key check (kind in ('students','storage','live_hours','seats','custom_domain')),
  label             text not null,
  unit              text not null,
  monthly_paise     bigint not null,
  adds_students     int not null default 0,
  adds_storage_gb   int not null default 0,
  adds_live_hours   int not null default 0,
  adds_seats        int not null default 0,
  adds_feature      text
);

create table public.platform_config (
  id                int primary key default 1 check (id = 1),
  commission_rate   numeric(5,4) not null default 0.20 check (commission_rate between 0 and 0.5),
  gateway_fee_rate  numeric(5,4) not null default 0.02 check (gateway_fee_rate between 0 and 0.05),
  refund_hold_days  int not null default 7 check (refund_hold_days between 0 and 30),
  payout_weekday    int not null default 1 check (payout_weekday between 0 and 6),   -- 1 = Monday
  attribution_days  int not null default 30 check (attribution_days between 0 and 365),
  trial_days        int not null default 14 check (trial_days between 0 and 60),
  trial_plan        text not null default 'growth' references public.plans(id),
  bodhin_tenant_id  uuid,                                   -- set by seed; never editable from the portal
  gst_rate          numeric(5,4) not null default 0.18,
  updated_at        timestamptz not null default now()
);

create table public.feature_flags (
  id                    int primary key default 1 check (id = 1),
  tutor_signups         boolean not null default true,
  marketplace_checkout  boolean not null default true,
  live_classes          boolean not null default true,
  maintenance           boolean not null default false,
  maintenance_message   text not null default '',
  updated_at            timestamptz not null default now()
);

create table public.role_perms (
  role  text not null check (role in ('super_admin','finance','moderator','support')),
  perm  text not null,
  primary key (role, perm)
);

create table public.categories (
  id      text primary key,
  name    text not null,
  icon    text not null default 'book',
  hidden  boolean not null default false,
  sort    int not null default 0
);

-- ─────────────── People ───────────────
-- One row per Supabase Auth user (created automatically by a trigger in 0002).
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  name            text not null default '',
  email           text not null default '',
  phone           text,
  phone_verified  boolean not null default false,
  avatar_url      text,
  staff_role      text check (staff_role in ('super_admin','finance','moderator','support')),
  locked          boolean not null default false,
  lock_reason     text,
  created_at      timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

-- ─────────────── Workspaces (tenants) ───────────────
create table public.tenants (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,30}$'),
  status           text not null default 'active' check (status in ('active','suspended')),
  display_name     text not null,
  tagline          text,
  primary_color    text not null default '#0F3D63',
  primary_deep     text not null default '#0A2A45',
  accent           text not null default '#F2A93B',
  logo_url         text,
  hide_powered_by  boolean not null default false,
  owner_id         uuid references public.profiles(id),
  custom_domain    text unique,
  domain_status    text check (domain_status in ('pending_dns','verifying','active')),
  created_at       timestamptz not null default now()
);

create table public.reserved_slugs (slug text primary key);

create table public.tenant_subscriptions (
  tenant_id    uuid primary key references public.tenants(id) on delete cascade,
  plan         text not null references public.plans(id),
  status       text not null check (status in ('trialing','active','past_due','cancelled')),
  billing      text not null default 'monthly' check (billing in ('monthly','annual')),
  period_end   timestamptz not null,
  pending      jsonb,            -- {plan, billing, at} downgrade scheduled at period end
  price_lock   jsonb,            -- {plan, monthly_paise, annual_paise, until}
  addons       jsonb not null default '[]',   -- [{kind, qty}]
  overrides    jsonb,            -- {features:{x:true}, limits:{activeStudents:null}}
  updated_at   timestamptz not null default now()
);

-- Readable by the owner + Bodhin staff. Gateway SECRETS are never stored here (see tenant_secrets).
create table public.tenant_payment_settings (
  tenant_id               uuid primary key references public.tenants(id) on delete cascade,
  direct_gateway          text check (direct_gateway in ('razorpay','cashfree')),
  direct_gateway_status   text not null default 'not_connected' check (direct_gateway_status in ('not_connected','pending','active')),
  gateway_key_id          text,      -- public key id (rzp_live_xxx) — safe to show
  payout_bank             text,
  payout_last4            text,
  payout_verified         boolean not null default false,
  gstin                   text,
  pan_last4               text,
  updated_at              timestamptz not null default now()
);

-- Service role only (no policies at all). Encrypt values before storing (Supabase Vault or app-level).
create table public.tenant_secrets (
  tenant_id           uuid primary key references public.tenants(id) on delete cascade,
  gateway_key_secret  text,
  webhook_secret      text,
  updated_at          timestamptz not null default now()
);

create table public.tenant_usage (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  storage_mb    bigint not null default 0,
  live_minutes  int not null default 0,         -- this calendar month
  month         date not null default date_trunc('month', now())::date
);

create table public.memberships (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  role       text not null check (role in ('student','tutor','owner')),
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id, role)
);
create index memberships_tenant_idx on public.memberships (tenant_id, role);

create table public.educator_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'draft' check (status in ('draft','submitted','under_review','approved','rejected','changes_requested')),
  workspace_name   text,
  slug             text,
  subjects         text[] not null default '{}',
  experience_years int,
  city             text,
  planned_students int,
  sample_url       text,
  id_verified      boolean not null default false,
  note             text,
  tenant_id        uuid references public.tenants(id),
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);
create unique index one_open_application on public.educator_applications (user_id) where status in ('draft','submitted','under_review','changes_requested');

-- ─────────────── Courses ───────────────
create table public.courses (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  tutor_id         uuid references public.profiles(id),
  title            text not null check (length(title) between 3 and 120),
  subtitle         text not null default '',
  description      text not null default '',
  category_id      text references public.categories(id),
  collections      text[] not null default '{}',
  level            text not null default 'all' check (level in ('beginner','intermediate','advanced','all')),
  format           text not null default 'recorded' check (format in ('live','recorded','hybrid')),
  language         text not null default 'English',
  price_paise      bigint not null default 0 check (price_paise >= 0),
  compare_at_paise bigint check (compare_at_paise is null or compare_at_paise > price_paise),
  offer_ends_at    timestamptz,
  access_months    int,                               -- null = lifetime
  certificate      boolean not null default true,
  outcomes         text[] not null default '{}',
  art              jsonb not null default '{"from":"#0F3D63","to":"#1E6FA8","icon":"book"}',
  badge            text check (badge in ('bestseller','new','trending')),
  status           text not null default 'draft' check (status in ('draft','published','archived')),
  visibility       text not null default 'private' check (visibility in ('private','public','public_promoted')),
  moderation       text not null default 'approved' check (moderation in ('approved','pending','rejected')),
  moderation_note  text,
  rating           numeric(2,1) not null default 0,
  rating_count     int not null default 0,
  students_count   int not null default 0,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  search           tsvector generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(subtitle,''))) stored
);
create index courses_tenant_idx on public.courses (tenant_id, status);
create index courses_market_idx on public.courses (visibility, moderation, status);
create index courses_search_idx on public.courses using gin (search);

create table public.course_tutors (          -- tutors assigned to a course (owner always has access)
  course_id  uuid not null references public.courses(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (course_id, user_id)
);

create table public.modules (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  title      text not null,
  position   int not null default 0
);
create index modules_course_idx on public.modules (course_id, position);

create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references public.modules(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  title         text not null,
  type          text not null default 'video' check (type in ('video','pdf','quiz')),
  duration_sec  int,
  size_mb       numeric(10,1),
  preview       boolean not null default false,
  description   text,
  resources     jsonb not null default '[]',
  completion    text not null default 'watch_90' check (completion in ('watch_90','manual')),
  video_uid     text,      -- Cloudflare Stream video id; playback only through a signed URL
  file_path     text,      -- storage path for PDFs
  position      int not null default 0
);
create index lessons_course_idx on public.lessons (course_id);

-- ─────────────── Learning ───────────────
create table public.enrollments (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id),
  source       text not null default 'direct',
  order_id     uuid,
  enrolled_at  timestamptz not null default now(),
  valid_till   timestamptz,                    -- null = lifetime
  primary key (user_id, course_id)
);
create index enrollments_tenant_idx on public.enrollments (tenant_id, user_id);

create table public.lesson_progress (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  position_sec  int not null default 0,
  completed     boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.reviews (
  course_id   uuid not null references public.courses(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  body        text not null default '',
  created_at  timestamptz not null default now(),
  primary key (course_id, user_id)
);

-- ─────────────── Money ───────────────
create table public.coupons (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,   -- Bodhin promo codes = coupons of the Bodhin tenant
  code        text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  type        text not null check (type in ('pct','flat')),
  value       int not null check (value > 0),          -- pct: 1–90, flat: rupees
  course_ids  uuid[] not null default '{}',            -- empty = all this workspace's courses
  max_uses    int,
  used        int not null default 0,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  paused      boolean not null default false,
  created_at  timestamptz not null default now(),
  check (type <> 'pct' or value <= 90),
  check (ends_at > starts_at)
);
create unique index coupons_code_idx on public.coupons (tenant_id, code);

create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id),
  course_id            uuid not null references public.courses(id),
  seller_tenant_id     uuid not null references public.tenants(id),
  checkout_tenant_id   uuid references public.tenants(id),          -- null = thebodhin.com
  channel              text not null check (channel in ('bodhin_own','tutor_direct','bodhin_marketplace')),
  collector            text not null check (collector in ('bodhin','educator')),
  list_paise           bigint not null,
  discount_paise       bigint not null default 0,
  amount_paise         bigint not null,                   -- what the learner pays (GST inclusive)
  gst_paise            bigint not null default 0,
  coupon_id            uuid references public.coupons(id),
  coupon_code          text,
  commission_paise     bigint not null default 0,
  gateway_fee_paise    bigint not null default 0,
  educator_share_paise bigint not null default 0,
  status               text not null default 'created' check (status in ('created','paid','failed','refunded')),
  gateway              text not null default 'razorpay',
  gateway_order_id     text unique,
  gateway_payment_id   text unique,
  invoice_no           text,
  source               text not null default 'direct',
  payout_status        text not null default 'not_applicable' check (payout_status in ('not_applicable','on_hold','ready','paid','held')),
  payout_date          timestamptz,
  created_at           timestamptz not null default now(),
  paid_at              timestamptz,
  check (commission_paise + gateway_fee_paise + educator_share_paise = amount_paise or status <> 'paid' or channel <> 'bodhin_marketplace')
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_seller_idx on public.orders (seller_tenant_id, created_at desc);
create index orders_payout_idx on public.orders (payout_status, payout_date);
-- Invoice numbers are unique per issuer: Bodhin's series, or each tutor's own series.
create unique index orders_invoice_idx on public.orders ((case when collector = 'bodhin' then 'bodhin' else seller_tenant_id::text end), invoice_no);

create table public.refund_requests (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id),
  user_id     uuid not null references public.profiles(id),
  reason      text not null,
  status      text not null default 'open' check (status in ('open','approved','rejected')),
  decided_by  uuid references public.profiles(id),
  note        text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create unique index one_open_refund on public.refund_requests (order_id) where status = 'open';

-- Subscription invoices Bodhin issues to workspaces.
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  no           text not null unique,
  description  text not null,
  amount_paise bigint not null,        -- incl. GST
  status       text not null check (status in ('paid','due','failed')),
  created_at   timestamptz not null default now()
);

create table public.invoice_counters (series text primary key, last int not null default 0);

create table public.gateway_events (     -- raw webhooks, processed once
  event_id     text primary key,
  tenant_id    uuid,
  type         text not null,
  payload      jsonb not null,
  processed_at timestamptz,
  received_at  timestamptz not null default now()
);

-- ─────────────── Ops ───────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'system',
  title       text not null,
  body        text not null default '',
  link        jsonb,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

create table public.tickets (
  id          uuid primary key default gen_random_uuid(),
  ref         text not null unique default ('BOD-' || (4600 + floor(random()*90000))::int),
  user_id     uuid not null references public.profiles(id),
  tenant_id   uuid references public.tenants(id),
  subject     text not null,
  status      text not null default 'open' check (status in ('open','pending','resolved')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  staff       boolean not null default false,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Append-only: no one can update or delete rows (enforced in 0003).
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  action      text not null,
  target_kind text not null,
  target_id   text not null,
  target_label text,
  summary     text not null,
  reason      text,
  before      jsonb,
  after       jsonb
);
create index audit_at_idx on public.audit_log (at desc);


-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · 0002 — business rules as database functions
-- Same rules as apps/student/src/core/business.ts and the POC tests.
-- Errors are raised with a plain-language message the app shows as is.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────── Who is calling ───────────────
create or replace function public.is_service() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or current_user in ('postgres', 'service_role', 'supabase_admin');
$$;

create or replace function public.staff_can(p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.role_perms r on r.role = p.staff_role
    where p.id = auth.uid() and not p.locked and r.perm = p_perm);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and staff_role is not null and not locked);
$$;

create or replace function public.has_tenant_role(p_tenant uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.tenant_id = p_tenant and m.role = any(p_roles));
$$;

create or replace function public.bodhin_tenant() returns uuid
language sql stable security definer set search_path = '' as $$ select bodhin_tenant_id from public.platform_config where id = 1; $$;

-- ─────────────── Audit (every staff write) ───────────────
create or replace function public.write_audit(p_action text, p_kind text, p_id text, p_label text, p_summary text, p_reason text default null, p_before jsonb default null, p_after jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, actor_name, action, target_kind, target_id, target_label, summary, reason, before, after)
  values (auth.uid(), (select name from public.profiles where id = auth.uid()), p_action, p_kind, p_id, p_label, p_summary, p_reason, p_before, p_after);
$$;

create or replace function public.require_reason(p_reason text) returns void language plpgsql as $$
begin
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'Please add a short reason (at least 5 characters). It goes into the audit log.' using errcode = 'P0001', hint = 'reason';
  end if;
end $$;

-- ─────────────── Plans & limits ───────────────
-- Plan + add-ons + admin overrides → what the workspace can use. null limit = unlimited.
create or replace function public.tenant_entitlements(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.tenant_subscriptions; p public.plans; a record;
  stu int; sto int; liv int; sea int; feats text[]; ov jsonb;
begin
  select * into s from public.tenant_subscriptions where tenant_id = p_tenant;
  if not found then return jsonb_build_object('students', 0, 'storage_gb', 0, 'live_hours', 0, 'seats', 0, 'features', '[]'::jsonb); end if;
  select * into p from public.plans where id = s.plan;
  stu := p.active_students; sto := p.storage_gb; liv := p.live_hours; sea := p.tutor_seats; feats := p.features;
  for a in select ad.*, (x ->> 'qty')::int as qty from jsonb_array_elements(s.addons) x join public.addons ad on ad.kind = x ->> 'kind' loop
    if stu is not null then stu := stu + a.adds_students * a.qty; end if;
    if sto is not null then sto := sto + a.adds_storage_gb * a.qty; end if;
    if liv is not null then liv := liv + a.adds_live_hours * a.qty; end if;
    if sea is not null then sea := sea + a.adds_seats * a.qty; end if;
    if a.adds_feature is not null and not a.adds_feature = any(feats) then feats := feats || a.adds_feature; end if;
  end loop;
  ov := coalesce(s.overrides, '{}'::jsonb);
  if ov -> 'limits' ? 'activeStudents' then stu := (ov -> 'limits' ->> 'activeStudents')::int; end if;
  if ov -> 'limits' ? 'storageGb' then sto := (ov -> 'limits' ->> 'storageGb')::int; end if;
  if ov -> 'limits' ? 'liveHours' then liv := (ov -> 'limits' ->> 'liveHours')::int; end if;
  if ov -> 'limits' ? 'tutorSeats' then sea := (ov -> 'limits' ->> 'tutorSeats')::int; end if;
  select coalesce(array_agg(f), '{}') into feats from (
    select unnest(feats) f except select key from jsonb_each_text(coalesce(ov -> 'features', '{}')) where value = 'false'
    union select key from jsonb_each_text(coalesce(ov -> 'features', '{}')) where value = 'true') q;
  return jsonb_build_object('plan', s.plan, 'students', stu, 'storage_gb', sto, 'live_hours', liv, 'seats', sea, 'features', to_jsonb(feats));
end $$;

create or replace function public.tenant_has(p_tenant uuid, p_feature text) returns boolean
language sql stable as $$ select public.tenant_entitlements(p_tenant) -> 'features' ? p_feature; $$;

-- Active student = a learner with at least one current enrolment in this workspace.
create or replace function public.active_students(p_tenant uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct user_id)::int from public.enrollments
  where tenant_id = p_tenant and (valid_till is null or valid_till > now());
$$;

-- Why a learner can't enrol in this workspace right now (null = open). 100% policy: new enrolments pause, nothing is deleted.
create or replace function public.enrol_block(p_tenant uuid, p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare lim int; already boolean;
begin
  if (select status from public.tenants where id = p_tenant) = 'suspended' then
    return 'This academy is not accepting new enrolments right now.';
  end if;
  select exists (select 1 from public.enrollments where tenant_id = p_tenant and user_id = p_user and (valid_till is null or valid_till > now())) into already;
  if already then return null; end if;
  lim := (public.tenant_entitlements(p_tenant) ->> 'students')::int;
  if lim is not null and public.active_students(p_tenant) >= lim then
    return 'This academy isn’t taking new enrolments right now. Please try again later.';
  end if;
  return null;
end $$;

-- ─────────────── Money ───────────────
-- bodhin_own: Bodhin's course → Bodhin 100%. tutor_direct: sold on the tutor's own site → tutor's gateway, 0% to Bodhin.
-- bodhin_marketplace: tutor course sold on thebodhin.com → Bodhin collects, keeps commission, pays the tutor.
create or replace function public.payment_route(p_course_tenant uuid, p_checkout_tenant uuid, out channel text, out collector text)
language plpgsql stable as $$
begin
  if p_course_tenant = public.bodhin_tenant() then channel := 'bodhin_own'; collector := 'bodhin';
  elsif p_checkout_tenant = p_course_tenant then channel := 'tutor_direct'; collector := 'educator';
  else channel := 'bodhin_marketplace'; collector := 'bodhin';
  end if;
end $$;

-- Refund hold, then the next payout weekday, 10:00 IST.
create or replace function public.payout_date_for(p_paid timestamptz) returns timestamptz
language plpgsql stable as $$
declare c public.platform_config; d date; begin
  select * into c from public.platform_config where id = 1;
  d := ((p_paid at time zone 'Asia/Kolkata') + make_interval(days => c.refund_hold_days))::date;
  while extract(dow from d)::int <> c.payout_weekday loop d := d + 1; end loop;
  return (d + time '10:00') at time zone 'Asia/Kolkata';
end $$;

create or replace function public.next_invoice_no(p_series text, p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare n int; fy text; y int := extract(year from now() at time zone 'Asia/Kolkata')::int;
begin
  -- Indian financial year: April–March, e.g. 2627 for FY 2026-27. Max 16 characters (GST rule): SERIE/2627/00001.
  if extract(month from now() at time zone 'Asia/Kolkata') < 4 then y := y - 1; end if;
  fy := lpad(((y % 100))::text, 2, '0') || lpad((((y + 1) % 100))::text, 2, '0');
  insert into public.invoice_counters as ic (series, last) values (p_series || ':' || fy, 1)
    on conflict (series) do update set last = ic.last + 1 returning last into n;
  return left(upper(p_prefix), 5) || '/' || fy || '/' || lpad(n::text, 5, '0');
end $$;

-- Price, coupon, GST and who collects — computed on the server, never trusted from the app.
create or replace function public.quote_for(p_user uuid, p_course uuid, p_coupon text, p_checkout_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.courses; r record; cp public.coupons; v_code text := upper(trim(coalesce(p_coupon, '')));
  disc bigint := 0; total bigint; gst numeric; blocked text; seller public.tenants; pay public.tenant_payment_settings;
begin
  select * into c from public.courses where id = p_course and status = 'published';
  if not found then raise exception 'This course is not available.' using errcode = 'P0001'; end if;
  select * into seller from public.tenants where id = c.tenant_id;
  select * into r from public.payment_route(c.tenant_id, p_checkout_tenant);
  if v_code <> '' then
    -- A coupon belongs to one workspace and works only on that workspace's courses (Bodhin promo codes → Bodhin courses only).
    select * into cp from public.coupons k where k.tenant_id = c.tenant_id and k.code = v_code limit 1;
    if not found then
      if exists (select 1 from public.coupons k where k.tenant_id = public.bodhin_tenant() and k.code = v_code) then
        raise exception 'This code is only valid on Bodhin’s own courses.' using errcode = 'P0001', hint = 'coupon';
      end if;
      raise exception 'This coupon code is not valid for this course.' using errcode = 'P0001', hint = 'coupon';
    end if;
    if cp.paused or now() < cp.starts_at or now() > cp.ends_at or (cp.max_uses is not null and cp.used >= cp.max_uses)
       or (cardinality(cp.course_ids) > 0 and not p_course = any(cp.course_ids)) then
      raise exception 'This coupon has expired or is not valid for this course.' using errcode = 'P0001', hint = 'coupon';
    end if;
    disc := case when cp.type = 'pct' then round(c.price_paise * cp.value / 100.0) else least(cp.value::bigint * 100, c.price_paise) end;
  end if;
  total := c.price_paise - disc;
  gst := (select gst_rate from public.platform_config where id = 1);
  blocked := public.enrol_block(c.tenant_id, p_user);
  if blocked is null and r.collector = 'educator' then
    select * into pay from public.tenant_payment_settings where tenant_id = c.tenant_id;
    if coalesce(pay.direct_gateway_status, 'not_connected') <> 'active' then blocked := 'This academy hasn’t finished payment setup yet. Please try again later.'; end if;
  end if;
  if blocked is null and r.channel = 'bodhin_marketplace' and not (select marketplace_checkout from public.feature_flags where id = 1) then
    blocked := 'Marketplace checkout is paused for maintenance. Please try again shortly.';
  end if;
  return jsonb_build_object(
    'course_id', c.id, 'list_paise', c.price_paise, 'discount_paise', disc, 'total_paise', total,
    'gst_paise', total - round(total / (1 + gst)), 'coupon_id', cp.id, 'coupon_code', nullif(v_code, ''),
    'coupon_label', case when cp.id is null then null when cp.type = 'pct' then cp.value || '% off' else '₹' || cp.value || ' off' end,
    'channel', r.channel, 'collector', r.collector, 'seller_tenant_id', c.tenant_id, 'seller_name', seller.display_name, 'blocked', blocked);
end $$;

create or replace function public.checkout_quote(p_course uuid, p_coupon text default null, p_checkout_tenant uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.quote_for(auth.uid(), p_course, p_coupon, p_checkout_tenant);
$$;

-- Called by the checkout Edge Function (service role) before opening Razorpay.
create or replace function public.create_order(p_user uuid, p_course uuid, p_coupon text, p_checkout_tenant uuid, p_source text default 'direct')
returns public.orders language plpgsql security definer set search_path = '' as $$
declare q jsonb; o public.orders; cfg public.platform_config; amt bigint; comm bigint := 0; fee bigint := 0; share bigint := 0;
begin
  if not public.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.enrollments where user_id = p_user and course_id = p_course) then
    raise exception 'You already have this course.' using errcode = 'P0001';
  end if;
  q := public.quote_for(p_user, p_course, p_coupon, p_checkout_tenant);
  if q ->> 'blocked' is not null then raise exception '%', q ->> 'blocked' using errcode = 'P0001'; end if;
  select * into cfg from public.platform_config where id = 1;
  amt := (q ->> 'total_paise')::bigint;
  if q ->> 'channel' = 'bodhin_marketplace' then
    comm := round(amt * cfg.commission_rate); fee := round(amt * cfg.gateway_fee_rate); share := amt - comm - fee;
  elsif q ->> 'channel' = 'tutor_direct' then share := amt;
  else comm := amt;      -- Bodhin own: 100% Bodhin
  end if;
  insert into public.orders (user_id, course_id, seller_tenant_id, checkout_tenant_id, channel, collector, list_paise, discount_paise, amount_paise, gst_paise,
                             coupon_id, coupon_code, commission_paise, gateway_fee_paise, educator_share_paise, source)
  values (p_user, p_course, (q ->> 'seller_tenant_id')::uuid, p_checkout_tenant, q ->> 'channel', q ->> 'collector', (q ->> 'list_paise')::bigint,
          (q ->> 'discount_paise')::bigint, amt, (q ->> 'gst_paise')::bigint, (q ->> 'coupon_id')::uuid, q ->> 'coupon_code', comm, fee, share, coalesce(p_source, 'direct'))
  returning * into o;
  return o;
end $$;

-- Enrolment shared by paid and free paths.
create or replace function public.grant_enrolment(p_user uuid, p_course uuid, p_source text, p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.courses;
begin
  select * into c from public.courses where id = p_course;
  insert into public.enrollments (user_id, course_id, tenant_id, source, order_id, valid_till)
  values (p_user, p_course, c.tenant_id, p_source, p_order, case when c.access_months is null then null else now() + make_interval(months => c.access_months) end)
  on conflict do nothing;
  if found then
    update public.courses set students_count = students_count + 1 where id = p_course;
    insert into public.memberships (user_id, tenant_id, role) values (p_user, c.tenant_id, 'student') on conflict do nothing;
  end if;
end $$;

-- Called by the Razorpay webhook / verify function (service role). Idempotent: a repeated webhook does nothing.
create or replace function public.mark_order_paid(p_order uuid, p_payment_id text) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare o public.orders; t public.tenants; series text;
begin
  if not public.is_service() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if o.status = 'paid' then return o; end if;
  select * into t from public.tenants where id = o.seller_tenant_id;
  -- Invoice series: Bodhin collects → Bodhin's series; tutor direct → invoice in the tutor's name.
  -- one counter per seller (each supplier numbers its own invoices); printed prefix is 5 letters
  series := case when o.collector = 'bodhin' then 'bodhin' else t.id::text end;
  update public.orders set status = 'paid', gateway_payment_id = p_payment_id, paid_at = now(), invoice_no = public.next_invoice_no(series, case when o.collector = 'bodhin' then 'BOD' else regexp_replace(t.slug, '[^a-z0-9]', '', 'g') end),
    payout_status = case when channel = 'bodhin_marketplace' then 'on_hold' else 'not_applicable' end,
    payout_date = case when channel = 'bodhin_marketplace' then public.payout_date_for(now()) else null end
  where id = p_order returning * into o;
  if o.coupon_id is not null then update public.coupons set used = used + 1 where id = o.coupon_id; end if;
  perform public.grant_enrolment(o.user_id, o.course_id, o.source, o.id);
  insert into public.notifications (user_id, kind, title, body, link)
  values (o.user_id, 'purchase', 'You’re enrolled!', 'Your payment was successful. Invoice ' || o.invoice_no || '.', jsonb_build_object('pathname', '/learn/' || o.course_id));
  if t.owner_id is not null then
    insert into public.notifications (user_id, kind, title, body)
    values (t.owner_id, 'sale', 'New enrolment', 'A learner bought ' || (select title from public.courses where id = o.course_id) || '.');
  end if;
  return o;
end $$;

-- Free course enrolment (learner calls this directly).
create or replace function public.enroll_free(p_course uuid, p_source text default 'direct') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.courses; b text;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = 'P0001'; end if;
  select * into c from public.courses where id = p_course and status = 'published';
  if not found then raise exception 'This course is not available.' using errcode = 'P0001'; end if;
  if c.price_paise <> 0 then raise exception 'This course is paid.' using errcode = 'P0001'; end if;
  b := public.enrol_block(c.tenant_id, auth.uid());
  if b is not null then raise exception '%', b using errcode = 'P0001'; end if;
  perform public.grant_enrolment(auth.uid(), p_course, coalesce(p_source, 'direct'), null);
end $$;

-- ─────────────── Educator onboarding ───────────────
create or replace function public.submit_application(p_workspace text, p_slug text, p_subjects text[], p_years int, p_city text, p_students int, p_sample text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.' using errcode = 'P0001'; end if;
  if not (select tutor_signups from public.feature_flags where id = 1) then
    raise exception 'New educator sign-ups are paused right now. Please try again soon.' using errcode = 'P0001';
  end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{2,30}$' or exists (select 1 from public.reserved_slugs where slug = p_slug) or exists (select 1 from public.tenants where slug = p_slug) then
    raise exception 'That web address is taken. Try another.' using errcode = 'P0001', hint = 'slug';
  end if;
  insert into public.educator_applications (user_id, status, workspace_name, slug, subjects, experience_years, city, planned_students, sample_url, submitted_at)
  values (auth.uid(), 'submitted', p_workspace, p_slug, p_subjects, p_years, p_city, p_students, p_sample, now())
  on conflict (user_id) where status in ('draft','submitted','under_review','changes_requested')
  do update set status = 'submitted', workspace_name = excluded.workspace_name, slug = excluded.slug, subjects = excluded.subjects,
     experience_years = excluded.experience_years, city = excluded.city, planned_students = excluded.planned_students, sample_url = excluded.sample_url, submitted_at = now()
  returning educator_applications.id into v_id;
  return v_id;
end $$;

-- Approve → workspace + 14-day trial on the trial plan + owner membership. Manual approval by staff.
create or replace function public.approve_educator(p_app uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.educator_applications; t uuid; cfg public.platform_config;
begin
  if not public.staff_can('approvals.educators') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  select * into a from public.educator_applications where id = p_app for update;
  if a.status not in ('submitted','under_review','changes_requested') then raise exception 'This application was already decided.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.tenants where slug = a.slug) then raise exception 'That web address is now taken. Ask the educator for another.' using errcode = 'P0001'; end if;
  select * into cfg from public.platform_config where id = 1;
  insert into public.tenants (slug, display_name, owner_id) values (a.slug, a.workspace_name, a.user_id) returning id into t;
  insert into public.tenant_subscriptions (tenant_id, plan, status, period_end) values (t, cfg.trial_plan, 'trialing', now() + make_interval(days => cfg.trial_days));
  insert into public.tenant_payment_settings (tenant_id) values (t);
  insert into public.tenant_usage (tenant_id) values (t);
  insert into public.memberships (user_id, tenant_id, role) values (a.user_id, t, 'owner');
  update public.educator_applications set status = 'approved', tenant_id = t, reviewed_at = now(), reviewed_by = auth.uid() where id = p_app;
  insert into public.notifications (user_id, kind, title, body, link) values (a.user_id, 'system', 'Your academy is approved 🎉',
    'Your ' || cfg.trial_days || '-day trial has started. Set up your first course.', '{"pathname":"/educator"}');
  perform public.write_audit('application.approve', 'application', p_app::text, a.workspace_name, 'Approved ' || a.workspace_name || ' (' || cfg.trial_days || '-day ' || cfg.trial_plan || ' trial)');
  return t;
end $$;

create or replace function public.decide_educator(p_app uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.educator_applications;
begin
  if not public.staff_can('approvals.educators') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  if p_decision not in ('rejected','changes_requested') then raise exception 'Use approve_educator to approve.'; end if;
  perform public.require_reason(p_note);
  update public.educator_applications set status = p_decision, note = p_note, reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_app and status in ('submitted','under_review','changes_requested') returning * into a;
  if not found then raise exception 'This application was already decided.' using errcode = 'P0001'; end if;
  insert into public.notifications (user_id, kind, title, body) values (a.user_id, 'system',
    case when p_decision = 'rejected' then 'Application not approved' else 'Changes requested on your application' end, p_note);
  perform public.write_audit('application.' || p_decision, 'application', p_app::text, a.workspace_name, p_decision || ': ' || a.workspace_name, p_note);
end $$;

-- ─────────────── Course moderation ───────────────
create or replace function public.decide_course(p_course uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.courses;
begin
  if not public.staff_can('approvals.courses') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Unknown decision.'; end if;
  if p_decision = 'rejected' then perform public.require_reason(p_note); end if;
  perform set_config('bodhin.moderating', 'on', true);
  update public.courses set moderation = p_decision, moderation_note = p_note where id = p_course returning * into c;
  insert into public.notifications (user_id, kind, title, body)
  select owner_id, 'system', case when p_decision = 'approved' then 'Your course is live on Bodhin' else 'Listing needs changes' end,
         c.title || coalesce(' — ' || p_note, '') from public.tenants where id = c.tenant_id and owner_id is not null;
  perform public.write_audit('course.' || p_decision, 'course', p_course::text, c.title, p_decision || ': ' || c.title, p_note);
end $$;

-- Educators can't approve themselves: going public sends a course to review; only staff set moderation.
create or replace function public.courses_guard() returns trigger language plpgsql as $$
begin
  if public.is_service() or current_setting('bodhin.moderating', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' then
    new.tenant_id := old.tenant_id; new.rating := old.rating; new.rating_count := old.rating_count; new.students_count := old.students_count;
    new.moderation := old.moderation; new.moderation_note := old.moderation_note;
  else
    new.rating := 0; new.rating_count := 0; new.students_count := 0; new.moderation := 'approved'; new.moderation_note := null;
  end if;
  if new.visibility <> 'private' and new.tenant_id <> public.bodhin_tenant()
     and (tg_op = 'INSERT' or old.visibility = 'private' or old.moderation = 'rejected' or new.title <> old.title or new.price_paise <> old.price_paise) then
    new.moderation := 'pending';
  end if;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
create trigger courses_guard before insert or update on public.courses for each row execute function public.courses_guard();

-- Coupons need the 'coupons' feature (Creator+); the Bodhin tenant can always create promo codes.
create or replace function public.coupons_guard() returns trigger language plpgsql as $$
begin
  if public.is_service() then return new; end if;
  new.code := upper(new.code);
  if tg_op = 'INSERT' then new.used := 0; else new.used := old.used; new.tenant_id := old.tenant_id; end if;
  if new.tenant_id <> public.bodhin_tenant() and not public.tenant_has(new.tenant_id, 'coupons') then
    raise exception 'Coupons are available from the Creator plan.' using errcode = 'P0001';
  end if;
  if cardinality(new.course_ids) > 0 and exists (select 1 from public.courses where id = any(new.course_ids) and tenant_id <> new.tenant_id) then
    raise exception 'You can only add your own courses to a coupon.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger coupons_guard before insert or update on public.coupons for each row execute function public.coupons_guard();

-- "Hide Powered by Bodhin" needs white-label; slug, owner and status are not editable by the workspace.
create or replace function public.tenants_guard() returns trigger language plpgsql as $$
begin
  if public.is_service() or public.staff_can('tenants.manage') then return new; end if;
  new.slug := old.slug; new.owner_id := old.owner_id; new.status := old.status;
  new.custom_domain := old.custom_domain; new.domain_status := old.domain_status;
  if new.hide_powered_by and not public.tenant_has(new.id, 'white_label') then new.hide_powered_by := false; end if;
  return new;
end $$;
create trigger tenants_guard before update on public.tenants for each row execute function public.tenants_guard();

-- ─────────────── Platform settings & flags (staff) ───────────────
create or replace function public.save_platform_config(p_next jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare before jsonb;
begin
  if not public.staff_can('config.edit') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  perform public.require_reason(p_reason);
  select to_jsonb(c) into before from public.platform_config c where id = 1;
  if (select monthly_paise from public.plans where id = coalesce(p_next ->> 'trial_plan', before ->> 'trial_plan')) is null then
    raise exception 'Trial plan must be a priced plan (not Enterprise).' using errcode = 'P0001';
  end if;
  update public.platform_config set                     -- bodhin_tenant_id is intentionally not updatable here
    commission_rate = coalesce((p_next ->> 'commission_rate')::numeric, commission_rate),
    gateway_fee_rate = coalesce((p_next ->> 'gateway_fee_rate')::numeric, gateway_fee_rate),
    refund_hold_days = coalesce((p_next ->> 'refund_hold_days')::int, refund_hold_days),
    payout_weekday = coalesce((p_next ->> 'payout_weekday')::int, payout_weekday),
    attribution_days = coalesce((p_next ->> 'attribution_days')::int, attribution_days),
    trial_days = coalesce((p_next ->> 'trial_days')::int, trial_days),
    trial_plan = coalesce(p_next ->> 'trial_plan', trial_plan),
    updated_at = now()
  where id = 1;
  perform public.write_audit('config.update', 'config', 'platform', 'Platform settings', 'Updated platform settings', p_reason, before, (select to_jsonb(c) from public.platform_config c where id = 1));
end $$;

create or replace function public.save_flags(p_next jsonb, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare before jsonb;
begin
  if not public.staff_can('config.edit') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  perform public.require_reason(p_reason);
  select to_jsonb(f) into before from public.feature_flags f where id = 1;
  update public.feature_flags set
    tutor_signups = coalesce((p_next ->> 'tutor_signups')::boolean, tutor_signups),
    marketplace_checkout = coalesce((p_next ->> 'marketplace_checkout')::boolean, marketplace_checkout),
    live_classes = coalesce((p_next ->> 'live_classes')::boolean, live_classes),
    maintenance = coalesce((p_next ->> 'maintenance')::boolean, maintenance),
    maintenance_message = coalesce(p_next ->> 'maintenance_message', maintenance_message),
    updated_at = now()
  where id = 1;
  perform public.write_audit('flags.update', 'config', 'flags', 'Kill switches', 'Changed kill switches', p_reason, before, (select to_jsonb(f) from public.feature_flags f where id = 1));
end $$;

create or replace function public.set_user_lock(p_user uuid, p_locked boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.staff_can('users.manage') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You can’t lock your own account.' using errcode = 'P0001'; end if;
  perform public.require_reason(p_reason);
  update public.profiles set locked = p_locked, lock_reason = case when p_locked then p_reason end where id = p_user;
  perform public.write_audit(case when p_locked then 'user.lock' else 'user.unlock' end, 'user', p_user::text, (select name from public.profiles where id = p_user),
    case when p_locked then 'Locked account' else 'Unlocked account' end, p_reason);
end $$;

create or replace function public.set_staff_role(p_user uuid, p_role text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.staff_can('admins.manage') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  perform public.require_reason(p_reason);
  if (select staff_role from public.profiles where id = p_user) = 'super_admin' and coalesce(p_role, '') <> 'super_admin'
     and (select count(*) from public.profiles where staff_role = 'super_admin' and not locked) <= 1 then
    raise exception 'Bodhin must always have at least one Super Admin.' using errcode = 'P0001';
  end if;
  update public.profiles set staff_role = p_role where id = p_user;
  perform public.write_audit('admin.role', 'admin', p_user::text, (select name from public.profiles where id = p_user), 'Staff role → ' || coalesce(p_role, 'none'), p_reason);
end $$;

-- ─────────────── New user → profile ───────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email, phone)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)), coalesce(new.email, ''), coalesce(new.phone, new.raw_user_meta_data ->> 'phone'))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ─────────────── Reviews keep the course rating current ───────────────
create or replace function public.refresh_rating() returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid := coalesce(new.course_id, old.course_id);
begin
  update public.courses set rating = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where course_id = cid), 0),
    rating_count = (select count(*) from public.reviews where course_id = cid) where id = cid;
  return null;
end $$;
create trigger reviews_rating after insert or update or delete on public.reviews for each row execute function public.refresh_rating();


-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · 0003 — Row-Level Security (who can see / change what)
-- Rule of thumb: the app reads through these policies; every money or
-- approval WRITE goes through a function in 0002 (or an Edge Function).
-- ════════════════════════════════════════════════════════════════════

-- Helpers
-- Row-based check (works for a row being inserted, before it exists in the table).
create or replace function public.can_edit_course_row(p_tenant uuid, p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.tenant_id = p_tenant and m.role = 'owner')
      or exists (select 1 from public.course_tutors ct where ct.course_id = p_course and ct.user_id = auth.uid())
      or (p_tenant = (select bodhin_tenant_id from public.platform_config where id = 1) and public.staff_can('content.bodhin'));
$$;
create or replace function public.can_edit_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_edit_course_row(c.tenant_id, c.id) from public.courses c where c.id = p_course), false);
$$;

create or replace function public.can_see_course(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses c where c.id = p_course and (c.status = 'published' or public.can_edit_course(c.id) or public.staff_can('approvals.courses')));
$$;

create or replace function public.is_enrolled(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments where user_id = auth.uid() and course_id = p_course and (valid_till is null or valid_till > now()));
$$;

-- Turn RLS on everywhere
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ─────────────── Public catalogue & settings ───────────────
create policy "read plans"      on public.plans           for select using (true);
create policy "read addons"     on public.addons          for select using (true);
create policy "read config"     on public.platform_config for select using (true);
create policy "read flags"      on public.feature_flags   for select using (true);
create policy "read perms"      on public.role_perms      for select using (true);
create policy "read categories" on public.categories      for select using (not hidden or public.is_staff());
create policy "staff categories" on public.categories     for all using (public.staff_can('content.bodhin')) with check (public.staff_can('content.bodhin'));
create policy "read slugs"      on public.reserved_slugs  for select using (true);

-- ─────────────── People ───────────────
create policy "own profile" on public.profiles for select using (
  id = auth.uid() or public.staff_can('users.view') or public.staff_can('tenants.view')
  or exists (select 1 from public.enrollments e join public.memberships m on m.tenant_id = e.tenant_id
             where e.user_id = profiles.id and m.user_id = auth.uid() and m.role in ('owner','tutor'))
  or exists (select 1 from public.courses c where c.tutor_id = profiles.id and c.status = 'published'));   -- tutor names on course pages
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (name, phone, avatar_url) on public.profiles to authenticated;

create policy "memberships" on public.memberships for select using (
  user_id = auth.uid() or public.has_tenant_role(tenant_id, array['owner']) or public.staff_can('tenants.view'));

create policy "applications" on public.educator_applications for select using (user_id = auth.uid() or public.staff_can('approvals.educators'));

-- ─────────────── Workspaces ───────────────
create policy "read tenants" on public.tenants for select using (true);                 -- branding is public
create policy "owner edits branding" on public.tenants for update using (public.has_tenant_role(id, array['owner']) or public.staff_can('tenants.manage'));
revoke update on public.tenants from anon, authenticated;
grant update (display_name, tagline, primary_color, primary_deep, accent, logo_url, hide_powered_by) on public.tenants to authenticated;

create policy "read subscription" on public.tenant_subscriptions for select using (
  public.has_tenant_role(tenant_id, array['owner','tutor']) or public.staff_can('tenants.view'));
create policy "read usage" on public.tenant_usage for select using (
  public.has_tenant_role(tenant_id, array['owner','tutor']) or public.staff_can('tenants.view'));
create policy "read payment settings" on public.tenant_payment_settings for select using (
  public.has_tenant_role(tenant_id, array['owner']) or public.staff_can('money.view'));
create policy "owner edits tax" on public.tenant_payment_settings for update using (public.has_tenant_role(tenant_id, array['owner']));
revoke update on public.tenant_payment_settings from anon, authenticated;
grant update (gstin) on public.tenant_payment_settings to authenticated;
-- tenant_secrets: RLS on, no policies → only the service role (Edge Functions) can read it.
revoke all on public.tenant_secrets from anon, authenticated;

-- ─────────────── Courses ───────────────
create policy "read courses" on public.courses for select using (status = 'published' or public.can_edit_course_row(tenant_id, id) or public.staff_can('approvals.courses'));
create policy "owner creates course" on public.courses for insert with check (
  public.has_tenant_role(tenant_id, array['owner']) or (tenant_id = public.bodhin_tenant() and public.staff_can('content.bodhin')));
create policy "edit course" on public.courses for update using (public.can_edit_course_row(tenant_id, id));
create policy "delete draft" on public.courses for delete using (public.can_edit_course_row(tenant_id, id) and status = 'draft' and not exists (select 1 from public.enrollments where course_id = courses.id));

create policy "read course tutors" on public.course_tutors for select using (public.can_see_course(course_id));
create policy "owner assigns tutors" on public.course_tutors for all
  using (exists (select 1 from public.courses c where c.id = course_id and public.has_tenant_role(c.tenant_id, array['owner'])))
  with check (exists (select 1 from public.courses c join public.memberships m on m.tenant_id = c.tenant_id and m.user_id = course_tutors.user_id and m.role = 'tutor'
                      where c.id = course_id and public.has_tenant_role(c.tenant_id, array['owner'])));

create policy "read modules" on public.modules for select using (public.can_see_course(course_id));
create policy "edit modules" on public.modules for all using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));
create policy "read lessons" on public.lessons for select using (public.can_see_course(course_id));
create policy "edit lessons" on public.lessons for all using (public.can_edit_course(course_id)) with check (public.can_edit_course(course_id));

-- ─────────────── Learning ───────────────
create policy "read enrolments" on public.enrollments for select using (
  user_id = auth.uid() or public.has_tenant_role(tenant_id, array['owner','tutor']) or public.staff_can('users.view'));
-- No insert/update policies: enrolments are created only by enroll_free() and mark_order_paid().

create policy "own progress" on public.lesson_progress for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_enrolled(course_id));
create policy "educator sees progress" on public.lesson_progress for select using (
  exists (select 1 from public.courses c where c.id = course_id and public.has_tenant_role(c.tenant_id, array['owner','tutor'])));

create policy "read reviews" on public.reviews for select using (true);
create policy "write own review" on public.reviews for insert with check (user_id = auth.uid() and public.is_enrolled(course_id));
create policy "edit own review" on public.reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own review" on public.reviews for delete using (user_id = auth.uid());

-- ─────────────── Money ───────────────
create policy "owner coupons" on public.coupons for select using (public.has_tenant_role(tenant_id, array['owner']) or public.staff_can('money.view'));
create policy "owner adds coupon" on public.coupons for insert with check (
  public.has_tenant_role(tenant_id, array['owner']) or (tenant_id = public.bodhin_tenant() and public.staff_can('content.bodhin')));
create policy "owner edits coupon" on public.coupons for update using (
  public.has_tenant_role(tenant_id, array['owner']) or (tenant_id = public.bodhin_tenant() and public.staff_can('content.bodhin')));
create policy "owner deletes unused coupon" on public.coupons for delete using (public.has_tenant_role(tenant_id, array['owner']) and used = 0);

create policy "read orders" on public.orders for select using (
  user_id = auth.uid() or public.has_tenant_role(seller_tenant_id, array['owner']) or public.staff_can('money.view'));
-- No write policies: orders are written only by create_order() / mark_order_paid() from Edge Functions.

create policy "read refunds" on public.refund_requests for select using (
  user_id = auth.uid() or public.staff_can('refunds')
  or exists (select 1 from public.orders o where o.id = order_id and public.has_tenant_role(o.seller_tenant_id, array['owner'])));
create policy "ask refund" on public.refund_requests for insert with check (
  user_id = auth.uid() and status = 'open' and exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid() and o.status = 'paid'
      and o.paid_at > now() - make_interval(days => (select refund_hold_days from public.platform_config where id = 1))));

create policy "read invoices" on public.invoices for select using (public.has_tenant_role(tenant_id, array['owner']) or public.staff_can('money.view'));
revoke all on public.invoice_counters, public.gateway_events from anon, authenticated;

-- ─────────────── Ops ───────────────
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

create policy "own tickets" on public.tickets for select using (user_id = auth.uid() or public.staff_can('support.tickets'));
create policy "open ticket" on public.tickets for insert with check (user_id = auth.uid() and status = 'open');
create policy "staff updates ticket" on public.tickets for update using (public.staff_can('support.tickets'));
create policy "ticket messages" on public.ticket_messages for select using (
  exists (select 1 from public.tickets t where t.id = ticket_id and (t.user_id = auth.uid() or public.staff_can('support.tickets'))));
create policy "reply" on public.ticket_messages for insert with check (author_id = auth.uid() and exists (
  select 1 from public.tickets t where t.id = ticket_id and ((t.user_id = auth.uid() and not ticket_messages.staff) or public.staff_can('support.tickets'))));

create policy "read audit" on public.audit_log for select using (public.staff_can('audit.view'));
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;   -- written only by write_audit()

-- ─────────────── Function access ───────────────
-- Internal money functions: Edge Functions (service role) only.
revoke execute on function public.create_order(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_order_paid(uuid, text) from public, anon, authenticated;
revoke execute on function public.grant_enrolment(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.quote_for(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.next_invoice_no(text, text) from public, anon, authenticated;
revoke execute on function public.write_audit(text, text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, text, uuid, text), public.mark_order_paid(uuid, text) to service_role;
-- Learner-facing: checkout_quote, enroll_free, submit_application. Staff-facing functions check permissions themselves.


-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · seed — generated from the POC (apps/student/src). Safe to run once on a new project.
-- ════════════════════════════════════════════════════════════════════

-- Plans (prices in paise)
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('starter', 'Starter', 79900, 767000, 50, 5, 10, 1, array['courses','recorded_video','live_classes','assessments','certificates','marketplace']::text[], false, 'Individual tutors and small cohorts', 0);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('creator', 'Creator', 149900, 1439000, 150, 20, 30, 1, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons']::text[], false, 'Growing educators and course creators', 1);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('growth', 'Growth', 349900, 3359000, 500, 50, 100, 5, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons','multi_tutor','advanced_reports']::text[], true, 'Established educators and academies', 2);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('institute', 'Institute', 799900, 7679000, 1500, 150, 250, 25, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons','multi_tutor','advanced_reports','custom_domain','white_label']::text[], false, 'Larger institutes and multi-tutor teams', 3);
insert into public.plans (id, name, monthly_paise, annual_paise, active_students, storage_gb, live_hours, tutor_seats, features, recommended, best_for, sort) values ('enterprise', 'Enterprise', null, null, null, null, null, null, array['courses','recorded_video','live_classes','assessments','certificates','marketplace','batches','coupons','multi_tutor','advanced_reports','custom_domain','white_label']::text[], false, 'Large or specialized deployments', 4);

-- Add-ons
insert into public.addons (kind, label, unit, monthly_paise, adds_students) values ('students', 'Student block', '+250 active students', 99900, 250);
insert into public.addons (kind, label, unit, monthly_paise, adds_storage_gb) values ('storage', 'Video storage', '+25 GB', 49900, 25);
insert into public.addons (kind, label, unit, monthly_paise, adds_live_hours) values ('live_hours', 'Live room-hours', '+20 hours / month', 69900, 20);
insert into public.addons (kind, label, unit, monthly_paise, adds_seats) values ('seats', 'Tutor seats', '+5 seats', 149900, 5);
insert into public.addons (kind, label, unit, monthly_paise, adds_feature) values ('custom_domain', 'Custom domain', 'your own domain + SSL', 49900, 'custom_domain');

-- Staff permissions
insert into public.role_perms (role, perm) values ('super_admin', 'overview');
insert into public.role_perms (role, perm) values ('super_admin', 'approvals.educators');
insert into public.role_perms (role, perm) values ('super_admin', 'approvals.courses');
insert into public.role_perms (role, perm) values ('super_admin', 'approvals.reports');
insert into public.role_perms (role, perm) values ('super_admin', 'tenants.view');
insert into public.role_perms (role, perm) values ('super_admin', 'tenants.manage');
insert into public.role_perms (role, perm) values ('super_admin', 'plans.edit');
insert into public.role_perms (role, perm) values ('super_admin', 'config.edit');
insert into public.role_perms (role, perm) values ('super_admin', 'money.view');
insert into public.role_perms (role, perm) values ('super_admin', 'payouts.run');
insert into public.role_perms (role, perm) values ('super_admin', 'refunds');
insert into public.role_perms (role, perm) values ('super_admin', 'content.bodhin');
insert into public.role_perms (role, perm) values ('super_admin', 'users.view');
insert into public.role_perms (role, perm) values ('super_admin', 'users.manage');
insert into public.role_perms (role, perm) values ('super_admin', 'support.tickets');
insert into public.role_perms (role, perm) values ('super_admin', 'broadcast');
insert into public.role_perms (role, perm) values ('super_admin', 'admins.manage');
insert into public.role_perms (role, perm) values ('super_admin', 'audit.view');
insert into public.role_perms (role, perm) values ('finance', 'overview');
insert into public.role_perms (role, perm) values ('finance', 'tenants.view');
insert into public.role_perms (role, perm) values ('finance', 'money.view');
insert into public.role_perms (role, perm) values ('finance', 'payouts.run');
insert into public.role_perms (role, perm) values ('finance', 'refunds');
insert into public.role_perms (role, perm) values ('finance', 'audit.view');
insert into public.role_perms (role, perm) values ('moderator', 'overview');
insert into public.role_perms (role, perm) values ('moderator', 'approvals.educators');
insert into public.role_perms (role, perm) values ('moderator', 'approvals.courses');
insert into public.role_perms (role, perm) values ('moderator', 'approvals.reports');
insert into public.role_perms (role, perm) values ('moderator', 'tenants.view');
insert into public.role_perms (role, perm) values ('moderator', 'content.bodhin');
insert into public.role_perms (role, perm) values ('support', 'overview');
insert into public.role_perms (role, perm) values ('support', 'tenants.view');
insert into public.role_perms (role, perm) values ('support', 'users.view');
insert into public.role_perms (role, perm) values ('support', 'users.manage');
insert into public.role_perms (role, perm) values ('support', 'support.tickets');

-- Reserved web addresses
insert into public.reserved_slugs (slug) values ('www'), ('app'), ('admin'), ('api'), ('mail'), ('help'), ('support'), ('blog'), ('bodhin'), ('static'), ('cdn'), ('status'), ('docs'), ('pay'), ('learn');

-- Categories
insert into public.categories (id, name, icon, sort) values ('all', 'All Courses', 'apps', 0);
insert into public.categories (id, name, icon, sort) values ('marketing', 'Marketing', 'megaphone', 1);
insert into public.categories (id, name, icon, sort) values ('ai-data', 'AI & Data', 'hardware-chip', 2);
insert into public.categories (id, name, icon, sort) values ('development', 'Development', 'code-slash', 3);
insert into public.categories (id, name, icon, sort) values ('design', 'Design', 'color-palette', 4);
insert into public.categories (id, name, icon, sort) values ('business', 'Business', 'briefcase', 5);

-- Bodhin itself is a workspace (its own courses: 100% to Bodhin)
insert into public.tenants (id, slug, display_name, tagline, primary_color, primary_deep, accent, hide_powered_by) values (md5('t_bodhin')::uuid, 'learn', 'Bodhin', 'Learn from India''s best educators', '#0F3D63', '#0A2A45', '#F2A93B', true);
insert into public.tenant_subscriptions (tenant_id, plan, status, period_end) values (md5('t_bodhin')::uuid, 'enterprise', 'active', '2099-12-31');
insert into public.tenant_payment_settings (tenant_id, direct_gateway_status) values (md5('t_bodhin')::uuid, 'active');
insert into public.tenant_usage (tenant_id) values (md5('t_bodhin')::uuid);
insert into public.platform_config (id, bodhin_tenant_id) values (1, md5('t_bodhin')::uuid);
insert into public.feature_flags (id) values (1);

-- Bodhin promo codes (valid only on Bodhin courses)
insert into public.coupons (tenant_id, code, type, value, ends_at) values (md5('t_bodhin')::uuid, 'BODHIN10', 'pct', 10, now() + interval '1 year'), (md5('t_bodhin')::uuid, 'WELCOME5', 'pct', 5, now() + interval '1 year');

-- Bodhin's own courses (demo content; videos are added later through the course builder)
insert into public.courses (id, tenant_id, title, subtitle, description, category_id, collections, level, format, language, price_paise, compare_at_paise, access_months, certificate, outcomes, art, status, visibility, moderation, published_at) values (md5('c_career')::uuid, md5('t_bodhin')::uuid, 'Career Launchpad: Communication & Interviews', 'Bodhin’s own program to get interview-ready in four weeks.', 'Resume, LinkedIn, spoken English for interviews and mock interviews with feedback. Built and taught by the Bodhin team.', 'business', array['career','job-ready']::text[], 'beginner', 'hybrid', 'English', 299900, null, null, true, array['ATS-friendly resume','LinkedIn profile that gets calls','Confident self-introduction','Answering HR & technical rounds']::text[], '{"from":"#0B3B73","to":"#D99A1E","icon":"briefcase"}'::jsonb, 'published', 'public_promoted', 'approved', now());
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn', 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l1')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn: overview', 'video', 720, null, true, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l2')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn in practice', 'video', 1080, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l3')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1320, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m38_l4')::uuid, md5('c_careercar_m38')::uuid, md5('c_career')::uuid, 'Resume & LinkedIn quiz', 'quiz', null, null, false, null, 3);
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics', 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l1')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics: overview', 'video', 900, null, false, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l2')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics in practice', 'video', 1200, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l3')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1380, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m39_l4')::uuid, md5('c_careercar_m39')::uuid, md5('c_career')::uuid, 'Communication Basics quiz', 'quiz', null, null, false, null, 3);
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds', 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l1')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds: overview', 'video', 1080, null, false, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l2')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds in practice', 'video', 1320, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l3')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1440, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m40_l4')::uuid, md5('c_careercar_m40')::uuid, md5('c_career')::uuid, 'Interview Rounds quiz', 'quiz', null, null, false, null, 3);
insert into public.modules (id, course_id, title, position) values (md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews', 3);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l1')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews: overview', 'video', 1260, null, false, null, 0);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l2')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews in practice', 'video', 1440, null, false, null, 1);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l3')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Hands-on walkthrough', 'video', 1500, null, false, null, 2);
insert into public.lessons (id, module_id, course_id, title, type, duration_sec, size_mb, preview, description, position) values (md5('c_careercar_m41_l4')::uuid, md5('c_careercar_m41')::uuid, md5('c_career')::uuid, 'Mock Interviews quiz', 'quiz', null, null, false, null, 3);


-- ════════════════════════════════════════════════════════════════════
-- Bodhin · Phase 1 · 0004 — refund decisions + listing quality bar
-- Run AFTER 0001–0003 + seed (or after bodhin_setup_all.sql).
-- Who decides a refund depends on who collected the money:
--   bodhin_own / bodhin_marketplace → Bodhin Finance (decide_refund)
--   tutor_direct                    → the academy owner (educator_decide_refund)
-- ════════════════════════════════════════════════════════════════════

-- Tell the right people when a learner asks for a refund.
create or replace function public.refund_requested() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.orders; t public.tenants; c text;
begin
  select * into o from public.orders where id = new.order_id;
  select * into t from public.tenants where id = o.seller_tenant_id;
  select title into c from public.courses where id = o.course_id;
  insert into public.notifications (user_id, kind, title, body, link) values (new.user_id, 'system', 'Refund request received',
    case when o.channel = 'tutor_direct' then t.display_name else 'Bodhin' end || ' is reviewing your request for “' || c || '”. Most decisions take 1–2 working days.', '{"pathname":"/payments"}');
  if o.channel = 'tutor_direct' and t.owner_id is not null then
    insert into public.notifications (user_id, kind, title, body, link) values (t.owner_id, 'system', 'Refund request on a direct sale',
      'A learner asked for a refund on “' || c || '”. Review it in Earnings.', '{"pathname":"/edu/earnings"}');
  end if;
  return new;
end $$;
create trigger refund_requested after insert on public.refund_requests for each row execute function public.refund_requested();

-- Shared effect of an approved refund.
create or replace function public.apply_refund(p_req uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.refund_requests; o public.orders;
begin
  select * into r from public.refund_requests where id = p_req;
  select * into o from public.orders where id = r.order_id for update;
  update public.orders set status = 'refunded',
    payout_status = case when channel = 'bodhin_marketplace' and payout_status <> 'paid' then 'not_applicable' else payout_status end
  where id = o.id;
  delete from public.enrollments where user_id = o.user_id and course_id = o.course_id;
  update public.courses set students_count = greatest(0, students_count - 1) where id = o.course_id;
  insert into public.notifications (user_id, kind, title, body, link) values (o.user_id, 'system',
    'Refund approved: ₹' || to_char(o.amount_paise / 100.0, 'FM99,99,999'), 'It reaches your original payment method in 5–7 working days.', '{"pathname":"/payments"}');
end $$;
revoke execute on function public.apply_refund(uuid) from public, anon, authenticated;

-- Bodhin Finance: refunds on money Bodhin collected.
create or replace function public.decide_refund(p_req uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.refund_requests; o public.orders;
begin
  if not public.staff_can('refunds') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  select * into r from public.refund_requests where id = p_req for update;
  if not found or r.status <> 'open' then raise exception 'Already decided.' using errcode = 'P0001'; end if;
  select * into o from public.orders where id = r.order_id;
  if o.channel = 'tutor_direct' then raise exception 'This was a direct sale — the educator refunds it from their own gateway.' using errcode = 'P0001'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Unknown decision.'; end if;
  if p_decision = 'rejected' then perform public.require_reason(p_note); end if;
  update public.refund_requests set status = p_decision, decided_by = auth.uid(), note = p_note, decided_at = now() where id = p_req;
  if p_decision = 'approved' then perform public.apply_refund(p_req);
  else insert into public.notifications (user_id, kind, title, body) values (r.user_id, 'system', 'Refund request not approved', p_note);
  end if;
  perform public.write_audit('refund.' || p_decision, 'order', o.id::text, o.invoice_no,
    case when p_decision = 'approved' then 'Refunded ' || o.invoice_no else 'Rejected refund ' || o.invoice_no end, p_note);
end $$;

-- Academy owner: refunds on their own direct sales (the money is in their gateway).
create or replace function public.educator_decide_refund(p_req uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.refund_requests; o public.orders;
begin
  select * into r from public.refund_requests where id = p_req for update;
  select * into o from public.orders where id = r.order_id;
  if not found or o.channel <> 'tutor_direct' or not public.has_tenant_role(o.seller_tenant_id, array['owner']) then
    raise exception 'Refund request not found.' using errcode = 'P0001';
  end if;
  if r.status <> 'open' then raise exception 'Already decided.' using errcode = 'P0001'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Unknown decision.'; end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Tell the learner why (5+ characters).' using errcode = 'P0001', hint = 'note';
  end if;
  update public.refund_requests set status = p_decision, decided_by = auth.uid(), note = p_note, decided_at = now() where id = p_req;
  if p_decision = 'approved' then perform public.apply_refund(p_req);
  else insert into public.notifications (user_id, kind, title, body) values (r.user_id, 'system', 'Refund request not approved', p_note);
  end if;
end $$;

-- Listing quality bar (same as the app): a marketplace listing needs 3+ lessons, 3+ outcomes,
-- a 50+ character description and a verified payout bank, before a moderator can approve it.
create or replace function public.decide_course(p_course uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.courses; n_lessons int; bank boolean;
begin
  if not public.staff_can('approvals.courses') then raise exception 'You don’t have permission for this.' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Unknown decision.'; end if;
  if p_decision = 'rejected' then perform public.require_reason(p_note); end if;
  select * into c from public.courses where id = p_course;
  if p_decision = 'approved' then
    select count(*) into n_lessons from public.lessons where course_id = p_course;
    select coalesce(payout_verified, false) into bank from public.tenant_payment_settings where tenant_id = c.tenant_id;
    if n_lessons < 3 or cardinality(array_remove(c.outcomes, '')) < 3 or length(c.description) < 50
       or (c.tenant_id <> public.bodhin_tenant() and not coalesce(bank, false)) then
      raise exception 'Can’t list yet: needs 3+ lessons, 3+ outcomes, a 50+ character description and a verified payout bank. Ask for changes instead.' using errcode = 'P0001';
    end if;
  end if;
  perform set_config('bodhin.moderating', 'on', true);
  update public.courses set moderation = p_decision, moderation_note = p_note where id = p_course returning * into c;
  insert into public.notifications (user_id, kind, title, body)
  select owner_id, 'system', case when p_decision = 'approved' then 'Your course is live on Bodhin' else 'Listing needs changes' end,
         c.title || coalesce(' — ' || p_note, '') from public.tenants where id = c.tenant_id and owner_id is not null;
  perform public.write_audit('course.' || p_decision, 'course', p_course::text, c.title, p_decision || ': ' || c.title, p_note);
end $$;


-- 0005 · Live classes: sessions, attendance, speaker permission, and the single "may this person join?" rule.
-- The Edge Function `live-token` only SIGNS a token after live_join_check() says yes, so the rules live here (testable), not in the function.

create table public.live_sessions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  host_id     uuid not null references public.profiles(id),
  title       text not null check (length(title) between 3 and 120),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null check (ends_at > starts_at),
  record      boolean not null default true,
  status      text not null default 'scheduled' check (status in ('scheduled','live','conducted','cancelled')),
  recording_path text,
  created_at  timestamptz not null default now()
);
create index live_sessions_course_idx on public.live_sessions (course_id, starts_at);

create table public.live_attendance (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  minutes    int not null default 0,
  primary key (session_id, user_id)
);

-- Students the host has allowed to speak (raised-hand approval). Revoked by deleting the row.
create table public.live_speakers (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table public.live_sessions enable row level security;
alter table public.live_attendance enable row level security;
alter table public.live_speakers enable row level security;

create policy "see sessions" on public.live_sessions for select using (public.is_enrolled(course_id) or public.has_tenant_role(tenant_id, array['owner','tutor']) or public.staff_can('tenants.view'));
create policy "host manages sessions" on public.live_sessions for all
  using (public.has_tenant_role(tenant_id, array['owner','tutor']))
  with check (public.has_tenant_role(tenant_id, array['owner','tutor']) and exists (select 1 from public.courses c where c.id = course_id and c.tenant_id = live_sessions.tenant_id));
create policy "own attendance" on public.live_attendance for select using (
  user_id = auth.uid() or exists (select 1 from public.live_sessions s where s.id = session_id and public.has_tenant_role(s.tenant_id, array['owner','tutor'])));
-- No insert/update policy: attendance is written only by live_join_check() / live_leave().
create policy "speakers read" on public.live_speakers for select using (
  user_id = auth.uid() or exists (select 1 from public.live_sessions s where s.id = session_id and public.has_tenant_role(s.tenant_id, array['owner','tutor'])));
create policy "host grants speaker" on public.live_speakers for all
  using (exists (select 1 from public.live_sessions s where s.id = session_id and public.has_tenant_role(s.tenant_id, array['owner','tutor'])))
  with check (exists (select 1 from public.live_sessions s where s.id = session_id and public.has_tenant_role(s.tenant_id, array['owner','tutor'])));

-- live_join_check: called with the caller's JWT. Returns what the Edge Function needs to sign a token.
create or replace function public.live_join_check(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.live_sessions; me uuid := auth.uid(); v_name text; v_role text; v_speak boolean;
begin
  if me is null then raise exception 'Sign in to join.' using errcode = '28000'; end if;
  select * into s from public.live_sessions where id = p_session;
  if not found or s.status = 'cancelled' then raise exception 'This class could not be found.' using errcode = 'P0002'; end if;
  if s.status = 'conducted' then raise exception 'This class has ended. The recording will be in Past & Attendance.' using errcode = 'P0001'; end if;
  if not (select live_classes from public.feature_flags where id = 1) then raise exception 'Live classes are temporarily unavailable. Please try again in a few minutes.' using errcode = 'P0001'; end if;
  if not public.tenant_has(s.tenant_id, 'live_classes') then raise exception 'Live classes are not included in this academy’s current plan.' using errcode = 'P0001'; end if;
  select name into v_name from public.profiles where id = me;

  if public.has_tenant_role(s.tenant_id, array['owner','tutor']) then
    v_role := 'host';
  elsif public.is_enrolled(s.course_id) then
    v_role := 'student';
  else
    raise exception 'Only enrolled learners can join this class.' using errcode = '42501';
  end if;

  if now() < s.starts_at - interval '10 minutes' then raise exception 'The room opens 10 minutes before the class starts.' using errcode = 'P0001'; end if;
  if now() > s.ends_at + interval '30 minutes' then raise exception 'This class has ended. The recording will be in Past & Attendance.' using errcode = 'P0001'; end if;

  select exists (select 1 from public.live_speakers where session_id = p_session and user_id = me) into v_speak;
  if v_role = 'student' then
    insert into public.live_attendance (session_id, user_id) values (p_session, me) on conflict do nothing;
  end if;
  return jsonb_build_object('room', s.tenant_id::text || ':' || s.id::text, 'role', v_role, 'name', coalesce(v_name, 'Learner'),
                            'identity', me::text, 'speak_allowed', v_speak, 'record', s.record);
end $$;

-- Student left: add the minutes they stayed (capped at the class length + grace so a forgotten tab can't inflate attendance).
create or replace function public.live_leave(p_session uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_session;
  if not found then return; end if;
  update public.live_attendance
     set minutes = minutes + least(greatest(p_minutes, 0), (extract(epoch from (s.ends_at - s.starts_at)) / 60)::int + 30)
   where session_id = p_session and user_id = auth.uid();
end $$;

grant execute on function public.live_join_check(uuid), public.live_leave(uuid, int) to authenticated;


-- 0006 · Playground: saved projects, solved challenges, and the daily quota for server-side runs.
-- Browser runners (HTML/CSS/JS, JS, TS, React, Python, SQL) cost nothing and are not metered.
-- Compiled languages run on Bodhin's code server (Piston) and are metered per learner per day.

create table public.playground_projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  stack      text not null check (stack ~ '^[a-z0-9-]{1,20}$'),
  title      text not null check (length(title) between 1 and 80),
  files      jsonb not null check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) between 1 and 8 and octet_length(files::text) <= 600000),
  updated_at timestamptz not null default now()
);
create index playground_projects_user_idx on public.playground_projects (user_id, updated_at desc);

create table public.playground_solved (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  challenge_id text not null check (challenge_id ~ '^[a-z0-9-]{1,40}$'),
  solved_at    timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

create table public.playground_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  remote_runs int not null default 0,
  primary key (user_id, day)
);

alter table public.playground_projects enable row level security;
alter table public.playground_solved enable row level security;
alter table public.playground_usage enable row level security;

create policy "own projects" on public.playground_projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own solved" on public.playground_solved for select using (user_id = auth.uid());
create policy "own usage" on public.playground_usage for select using (user_id = auth.uid());
-- solved / usage rows are written only through the functions below.

-- At most 30 saved projects per learner (the same number the app shows).
create or replace function public.playground_project_cap() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.playground_projects where user_id = new.user_id) >= 30 then
    raise exception 'You can keep up to 30 saved projects. Delete one to save a new one.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger playground_project_cap before insert or update on public.playground_projects for each row execute function public.playground_project_cap();

-- Use up `p_units` server runs for today, or refuse. Called by the Edge Function BEFORE it contacts the code server.
create or replace function public.playground_consume(p_units int) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); used int; lim constant int := 30;
begin
  if me is null then raise exception 'Sign in to run code.' using errcode = '28000'; end if;
  if p_units < 1 or p_units > 5 then raise exception 'Bad request.' using errcode = '22023'; end if;
  insert into public.playground_usage (user_id, day, remote_runs) values (me, (now() at time zone 'utc')::date, 0) on conflict do nothing;
  update public.playground_usage set remote_runs = remote_runs + p_units
   where user_id = me and day = (now() at time zone 'utc')::date and remote_runs + p_units <= lim
   returning remote_runs into used;
  if used is null then raise exception 'You have used today’s % server runs. Browser languages (HTML/CSS/JS, JavaScript, TypeScript, React, Python, SQL) are unlimited — or come back tomorrow.', lim using errcode = 'P0001'; end if;
  return lim - used;
end $$;

create or replace function public.playground_mark_solved(p_challenge text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  insert into public.playground_solved (user_id, challenge_id) values (auth.uid(), p_challenge) on conflict do nothing;
end $$;

grant execute on function public.playground_consume(int), public.playground_mark_solved(text) to authenticated;


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

-- ════════════════════════════════════════════════════════════════════
-- 0008_scale.sql — readiness for 10,000+ people online at the same time (see docs/SCALE_10K.md).
-- 1) Index every foreign key that has no index yet (Postgres does not create them; RLS checks and joins need them).
-- 2) Hot-path indexes for what the app reads most.
-- 3) Live classes: interactive seats per class; learners beyond them get broadcast view (HLS via CDN).
-- Safe to run more than once.

-- 1) Foreign keys without a leading index → create one (named fk_<table>_<cols>).
do $$
declare r record; idx text;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conrelid, c.conkey,
           string_agg(a.attname, ',' order by k.ord) as cols,
           string_agg(quote_ident(a.attname), ', ' order by k.ord) as qcols
      from pg_constraint c
      cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     group by c.oid, c.conrelid, c.conkey
  loop
    -- skip when an existing index already starts with these columns (in this order)
    if not exists (
      select 1 from pg_index i
       where i.indrelid = r.conrelid
         and (i.indkey::int2[])[0:array_length(r.conkey, 1) - 1] = r.conkey
    ) then
      idx := left('fk_' || replace(r.tbl::text, 'public.', '') || '_' || replace(r.cols, ',', '_'), 63);
      execute format('create index if not exists %I on %s (%s)', idx, r.tbl, r.qcols);
    end if;
  end loop;
end $$;

-- 2) Hot paths
create index if not exists enrollments_user_course_idx on public.enrollments (user_id, course_id);
create index if not exists lesson_progress_user_idx     on public.lesson_progress (user_id);
create index if not exists live_sessions_tenant_time    on public.live_sessions (tenant_id, starts_at);
create index if not exists live_sessions_upcoming       on public.live_sessions (starts_at) where status = 'scheduled';
create index if not exists courses_listed_idx           on public.courses (tenant_id) where status = 'published';
create index if not exists reviews_course_idx           on public.reviews (course_id);
create index if not exists community_posts_channel_time on public.community_posts (channel_id, at desc);

-- 3) Live-class seats
alter table public.platform_config
  add column if not exists live_interactive_seats int not null default 1000 check (live_interactive_seats between 50 and 2500);
alter table public.live_attendance
  add column if not exists mode text not null default 'interactive' check (mode in ('interactive','broadcast'));
create index if not exists live_attendance_mode_idx on public.live_attendance (session_id, mode);

-- Same rules as 0005, plus the seat decision. The count is serialised per class with an advisory lock so that
-- 1,000 learners joining in the same second cannot overfill the interactive seats.
create or replace function public.live_join_check(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.live_sessions; me uuid := auth.uid(); v_name text; v_role text; v_speak boolean;
        v_mode text := 'interactive'; v_seats int; v_taken int; v_prev text;
begin
  if me is null then raise exception 'Sign in to join.' using errcode = '28000'; end if;
  select * into s from public.live_sessions where id = p_session;
  if not found or s.status = 'cancelled' then raise exception 'This class could not be found.' using errcode = 'P0002'; end if;
  if s.status = 'conducted' then raise exception 'This class has ended. The recording will be in Past.' using errcode = 'P0001'; end if;
  if not (select live_classes from public.feature_flags where id = 1) then raise exception 'Live classes are temporarily unavailable. Please try again in a few minutes.' using errcode = 'P0001'; end if;
  if not public.tenant_has(s.tenant_id, 'live_classes') then raise exception 'Live classes are not included in this academy’s current plan.' using errcode = 'P0001'; end if;
  select name into v_name from public.profiles where id = me;

  if public.has_tenant_role(s.tenant_id, array['owner','tutor']) then
    v_role := 'host';
  elsif public.is_enrolled(s.course_id) then
    v_role := 'student';
  else
    raise exception 'Only enrolled learners can join this class.' using errcode = '42501';
  end if;

  if now() < s.starts_at - interval '10 minutes' then raise exception 'The room opens 10 minutes before the class starts.' using errcode = 'P0001'; end if;
  if now() > s.ends_at + interval '30 minutes' then raise exception 'This class has ended. The recording will be in Past.' using errcode = 'P0001'; end if;

  select exists (select 1 from public.live_speakers where session_id = p_session and user_id = me) into v_speak;

  if v_role = 'student' then
    select mode into v_prev from public.live_attendance where session_id = p_session and user_id = me;
    if v_prev is not null then
      v_mode := case when v_speak then 'interactive' else v_prev end;      -- rejoin keeps the seat type
    elsif not v_speak then
      perform pg_advisory_xact_lock(hashtext(p_session::text));
      select live_interactive_seats into v_seats from public.platform_config where id = 1;
      select count(*) into v_taken from public.live_attendance where session_id = p_session and mode = 'interactive';
      if v_taken >= coalesce(v_seats, 1000) then v_mode := 'broadcast'; end if;
    end if;
    insert into public.live_attendance (session_id, user_id, mode) values (p_session, me, v_mode)
      on conflict (session_id, user_id) do update set mode = excluded.mode;
  end if;

  return jsonb_build_object('room', s.tenant_id::text || ':' || s.id::text, 'role', v_role, 'name', coalesce(v_name, 'Learner'),
                            'identity', me::text, 'speak_allowed', v_speak, 'record', s.record, 'mode', v_mode);
end $$;

-- ════════════════════════════════════════════════════════════════════
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

-- ════════════════════════════════════════════════════════════════════
-- 0010_academy_workflows.sql — Nov 16 change request (team feedback). Same rules as apps/student/src/core/academy.ts
-- and src/api/academy.ts, enforced by the database so no app can skip them. Safe to run more than once.
--
--  1. Certificates: eligible at 75% of the course + the required quiz passed → request → the academy owner (or the
--     Bodhin team for Bodhin's own courses) approves or rejects with a reason → issued once, unique ID, learner notified.
--     Per academy: approval on/off; per course: which quiz is required (none / a quiz lesson).
--     Uploaded certificate designs (backgrounds).
--  2. 1:1 mentorship: learner (buyer only) asks a tutor of the course → accept with a time / reject with a reason → notified.
--  3. Course-wide live classes: inserting a live_session notifies every buyer; cancelling notifies them with the reason.
--  4. Teaching reminders (timetable), private to each educator.
--  5. Course categories per academy ("Other" → new category); cover image + intro video on courses.
--  6. Tutors can create courses (assigned to themselves) but cannot change price / status / visibility.

/* ───────────── course media + quiz pass mark ───────────── */
alter table public.courses add column if not exists cover_image_path text;       -- storage path (public-read bucket "covers")
alter table public.courses add column if not exists intro_video_uid text;        -- Cloudflare Stream id (signed playback)
alter table public.lessons add column if not exists pass_pct int not null default 60 check (pass_pct between 1 and 100);

/* ───────────── quiz attempts (best score decides the certificate) ───────────── */
create table if not exists public.quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  course_id    uuid not null references public.courses(id) on delete cascade,
  lesson_id    uuid not null references public.lessons(id) on delete cascade,   -- a lesson of type 'quiz'
  score_pct    int not null check (score_pct between 0 and 100),
  submitted_at timestamptz not null default now()
);
create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, lesson_id);

/* ───────────── certificates ───────────── */
create table if not exists public.certificates (
  id         text primary key,                                   -- BODHIN-<CODE>-<YEAR>-<6 random>, public verify page
  user_id    uuid not null references public.profiles(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id),
  issued_at  timestamptz not null default now(),
  issued_by  uuid references public.profiles(id),
  unique (user_id, course_id)
);
create table if not exists public.cert_settings (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  approval      boolean not null default true,                  -- false = issue automatically when eligible
  design_path   text                                            -- chosen uploaded background (storage path)
);
create table if not exists public.course_cert_rules (
  course_id      uuid primary key references public.courses(id) on delete cascade,
  required_quiz  uuid references public.lessons(id) on delete set null,
  no_quiz        boolean not null default false                 -- true = 75% alone is enough
);
create table if not exists public.cert_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  progress_pct  int not null,
  quiz_pct      int,
  reason        text check (reason is null or length(reason) between 10 and 300),
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references public.profiles(id),
  cert_id       text references public.certificates(id)
);
create unique index if not exists cert_requests_one_pending on public.cert_requests (user_id, course_id) where status = 'pending';
create table if not exists public.cert_designs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(name) between 1 and 40),
  file_path   text not null,                                     -- storage path (bucket "cert-designs")
  created_at  timestamptz not null default now()
);

/* Who decides for an academy: its owner(s); for Bodhin's own courses, Bodhin staff with content rights. */
create or replace function public.is_cert_approver(p_tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_tenant_role(p_tenant, array['owner'])
      or (p_tenant = public.bodhin_tenant() and public.staff_can('content.bodhin'));
$$;

create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link jsonb default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, p_body, p_link);
$$;
revoke execute on function public.notify(uuid, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.notify_approvers(p_tenant uuid, p_title text, p_body text, p_link jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_tenant = public.bodhin_tenant() then
    insert into public.notifications (user_id, kind, title, body, link)
      select id, 'course', p_title, p_body, p_link from public.profiles where staff_role in ('super_admin', 'moderator');
  else
    insert into public.notifications (user_id, kind, title, body, link)
      select user_id, 'course', p_title, p_body, p_link from public.memberships where tenant_id = p_tenant and role = 'owner';
  end if;
end $$;
revoke execute on function public.notify_approvers(uuid, text, text, jsonb) from public, anon, authenticated;

/* Eligibility, same as certEligibility(): progress ≥ 75% AND (no quiz needed OR best score ≥ pass mark). */
create or replace function public.cert_eligibility(p_user uuid, p_course uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare total int; done int; pct int; q uuid; noq boolean; pass int; best int;
begin
  select count(*) into total from public.lessons where course_id = p_course;
  select count(*) into done from public.lesson_progress where course_id = p_course and user_id = p_user and completed;
  pct := case when total = 0 then 0 else round(done * 100.0 / total) end;
  select required_quiz, coalesce(no_quiz, false) into q, noq from public.course_cert_rules where course_id = p_course;
  if not coalesce(noq, false) and q is null then   -- default: the last quiz of the course
    select l.id into q from public.lessons l join public.modules m on m.id = l.module_id
     where l.course_id = p_course and l.type = 'quiz' order by m.position desc, l.position desc limit 1;
  end if;
  if coalesce(noq, false) then q := null; end if;
  if q is not null then
    select pass_pct into pass from public.lessons where id = q;
    select max(score_pct) into best from public.quiz_attempts where user_id = p_user and lesson_id = q;
  end if;
  return jsonb_build_object('progress_pct', pct, 'quiz', q, 'pass_pct', pass, 'best_pct', best,
    'eligible', pct >= 75 and (q is null or coalesce(best, -1) >= pass));
end $$;

create or replace function public.new_cert_id(p_course uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare code text; v_id text;
begin
  select upper(left(regexp_replace(coalesce(title, 'CRS'), '[^A-Za-z0-9]', '', 'g'), 4)) into code from public.courses where id = p_course;
  loop
    v_id := 'BODHIN-' || coalesce(nullif(code, ''), 'CRS') || '-' || extract(year from now())::int || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.certificates c where c.id = v_id);
  end loop;
  return v_id;
end $$;

/* Runs after progress or a quiz attempt changes: queue a request (or issue at once when approval is off). */
create or replace function public.cert_check(p_user uuid, p_course uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.courses; el jsonb; approval boolean; cid text; title text;
begin
  select * into c from public.courses where id = p_course;
  if not found or not c.certificate or not public.tenant_has(c.tenant_id, 'certificates') then return 'off'; end if;
  if exists (select 1 from public.certificates where user_id = p_user and course_id = p_course) then return 'issued'; end if;
  if exists (select 1 from public.cert_requests where user_id = p_user and course_id = p_course) then return 'requested'; end if;
  el := public.cert_eligibility(p_user, p_course);
  if not (el ->> 'eligible')::boolean then return 'not_eligible'; end if;
  select coalesce((select s.approval from public.cert_settings s where s.tenant_id = c.tenant_id), true) into approval;
  if not approval then
    cid := public.new_cert_id(p_course);
    insert into public.certificates (id, user_id, course_id, tenant_id) values (cid, p_user, p_course, c.tenant_id);
    perform public.notify(p_user, 'course', 'Your certificate is ready', '“' || c.title || '” — download it from Certificates.', jsonb_build_object('pathname', '/certificate/[id]', 'params', jsonb_build_object('id', cid)));
    return 'issued';
  end if;
  insert into public.cert_requests (user_id, course_id, tenant_id, progress_pct, quiz_pct)
    values (p_user, p_course, c.tenant_id, (el ->> 'progress_pct')::int, (el ->> 'best_pct')::int);
  select name into title from public.profiles where id = p_user;
  perform public.notify_approvers(c.tenant_id, 'Certificate approval needed', coalesce(title, 'A learner') || ' finished ' || (el ->> 'progress_pct') || '% of “' || c.title || '”. Approve or reject.', jsonb_build_object('pathname', '/edu/certificates'));
  perform public.notify(p_user, 'course', 'Certificate sent for approval', 'You’re eligible for the “' || c.title || '” certificate. Your educator will review it soon.', jsonb_build_object('pathname', '/certificates'));
  return 'requested';
end $$;
revoke execute on function public.cert_check(uuid, uuid) from public, anon;

create or replace function public.cert_check_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cert_check(new.user_id, new.course_id);
  return new;
end $$;
drop trigger if exists cert_after_progress on public.lesson_progress;
create trigger cert_after_progress after insert or update of completed on public.lesson_progress for each row when (new.completed) execute function public.cert_check_trigger();
drop trigger if exists cert_after_quiz on public.quiz_attempts;
create trigger cert_after_quiz after insert on public.quiz_attempts for each row execute function public.cert_check_trigger();

/* Approver decides. Reject needs a reason (10–300 characters); approve issues the certificate. */
create or replace function public.cert_decide(p_request uuid, p_approve boolean, p_reason text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.cert_requests; cid text; t text;
begin
  select * into r from public.cert_requests where id = p_request for update;
  if not found or not public.is_cert_approver(r.tenant_id) then raise exception 'You can’t decide this request.' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'This request was already %.', r.status using errcode = 'P0001'; end if;
  select title into t from public.courses where id = r.course_id;
  if not p_approve then
    if p_reason is null or length(trim(p_reason)) < 10 then raise exception 'Tell the learner why in at least 10 characters.' using errcode = 'P0001'; end if;
    update public.cert_requests set status = 'rejected', reason = trim(p_reason), decided_at = now(), decided_by = auth.uid() where id = p_request;
    perform public.notify(r.user_id, 'course', 'Certificate not approved yet', '“' || t || '”: ' || trim(p_reason), jsonb_build_object('pathname', '/certificates'));
    return null;
  end if;
  cid := public.new_cert_id(r.course_id);
  insert into public.certificates (id, user_id, course_id, tenant_id, issued_by) values (cid, r.user_id, r.course_id, r.tenant_id, auth.uid());
  update public.cert_requests set status = 'approved', decided_at = now(), decided_by = auth.uid(), cert_id = cid where id = p_request;
  perform public.notify(r.user_id, 'course', 'Certificate approved', 'Your “' || t || '” certificate is ready to view and download.', jsonb_build_object('pathname', '/certificate/[id]', 'params', jsonb_build_object('id', cid)));
  insert into public.audit_log (actor_id, action, target_kind, target_id, summary) values (auth.uid(), 'certificate.approve', 'certificate', cid, t);
  return cid;
end $$;
grant execute on function public.cert_decide(uuid, boolean, text) to authenticated;

/* Learner asks again after a rejection (only if still eligible). */
create or replace function public.cert_request_again(p_course uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare el jsonb; c public.courses; v_id uuid;
begin
  if not public.is_enrolled(p_course) then raise exception 'You’re not enrolled in this course.' using errcode = '42501'; end if;
  if exists (select 1 from public.cert_requests where user_id = auth.uid() and course_id = p_course and status = 'pending') then raise exception 'Your request is already with your educator.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.certificates where user_id = auth.uid() and course_id = p_course) then raise exception 'Your certificate is already issued.' using errcode = 'P0001'; end if;
  el := public.cert_eligibility(auth.uid(), p_course);
  if not (el ->> 'eligible')::boolean then raise exception 'Not eligible yet.' using errcode = 'P0001'; end if;
  select * into c from public.courses where courses.id = p_course;
  insert into public.cert_requests (user_id, course_id, tenant_id, progress_pct, quiz_pct) values (auth.uid(), p_course, c.tenant_id, (el ->> 'progress_pct')::int, (el ->> 'best_pct')::int) returning cert_requests.id into v_id;
  perform public.notify_approvers(c.tenant_id, 'Certificate approval needed', 'A learner asked again for the “' || c.title || '” certificate.', jsonb_build_object('pathname', '/edu/certificates'));
  return v_id;
end $$;
grant execute on function public.cert_request_again(uuid) to authenticated;

/* ───────────── 1:1 mentorship ───────────── */
create table if not exists public.mentor_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id),
  mentor_id     uuid references public.profiles(id),            -- null = the Bodhin team (Bodhin courses)
  topic         text not null check (length(trim(topic)) between 10 and 500),
  preferred_at  timestamptz not null,
  duration_min  int not null check (duration_min in (15, 30, 45, 60)),
  status        text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  note          text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references public.profiles(id)
);
create unique index if not exists mentor_one_pending on public.mentor_requests (user_id, course_id) where status = 'pending';
create index if not exists mentor_mentor_idx on public.mentor_requests (mentor_id, status, starts_at);

create or replace function public.can_mentor(p_tenant uuid, p_course uuid, p_mentor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_tenant_role(p_tenant, array['owner'])
      or p_mentor = auth.uid()
      or exists (select 1 from public.course_tutors where course_id = p_course and user_id = auth.uid())
      or (p_tenant = public.bodhin_tenant() and public.staff_can('content.bodhin'));
$$;

create or replace function public.mentor_request(p_course uuid, p_mentor uuid, p_topic text, p_at timestamptz, p_minutes int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.courses; v_id uuid; who text;
begin
  if not public.is_enrolled(p_course) then raise exception 'You can book mentorship only for courses you have bought.' using errcode = '42501'; end if;
  select * into c from public.courses where courses.id = p_course;
  if public.tenant_locked(c.tenant_id) then raise exception 'This academy isn’t taking mentorship bookings right now.' using errcode = 'P0001'; end if;
  if p_at < now() + interval '1 hour' or p_at > now() + interval '60 days' then raise exception 'Pick a time from 1 hour to 60 days from now.' using errcode = 'P0001'; end if;
  if c.tenant_id = public.bodhin_tenant() then
    p_mentor := null;
  elsif p_mentor is null or not (exists (select 1 from public.course_tutors where course_id = p_course and user_id = p_mentor)
        or exists (select 1 from public.memberships where tenant_id = c.tenant_id and user_id = p_mentor and role = 'owner')) then
    raise exception 'Pick a tutor from this course.' using errcode = 'P0001';
  end if;
  insert into public.mentor_requests (user_id, course_id, tenant_id, mentor_id, topic, preferred_at, duration_min)
    values (auth.uid(), p_course, c.tenant_id, p_mentor, trim(p_topic), p_at, p_minutes) returning mentor_requests.id into v_id;
  select name into who from public.profiles where profiles.id = auth.uid();
  if p_mentor is null then
    perform public.notify_approvers(c.tenant_id, 'New 1:1 mentorship request', coalesce(who, 'A learner') || ' · “' || c.title || '”', jsonb_build_object('pathname', '/edu/mentorship'));
  else
    perform public.notify(p_mentor, 'course', 'New 1:1 mentorship request', coalesce(who, 'A learner') || ' · “' || c.title || '”', jsonb_build_object('pathname', '/edu/mentorship'));
  end if;
  return v_id;
end $$;
grant execute on function public.mentor_request(uuid, uuid, text, timestamptz, int) to authenticated;

create or replace function public.mentor_respond(p_id uuid, p_accept boolean, p_note text default null, p_at timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.mentor_requests; s timestamptz; e timestamptz; t text;
begin
  select * into r from public.mentor_requests where id = p_id for update;
  if not found or not public.can_mentor(r.tenant_id, r.course_id, r.mentor_id) then raise exception 'You can’t answer this request.' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'This request is already %.', r.status using errcode = 'P0001'; end if;
  select title into t from public.courses where id = r.course_id;
  if not p_accept then
    if p_note is null or length(trim(p_note)) < 10 then raise exception 'Tell the learner why in at least 10 characters.' using errcode = 'P0001'; end if;
    update public.mentor_requests set status = 'rejected', note = trim(p_note), decided_at = now(), decided_by = auth.uid() where id = p_id;
    perform public.notify(r.user_id, 'course', 'Mentorship request not accepted', '“' || t || '”: ' || trim(p_note), jsonb_build_object('pathname', '/mentorship'));
    return;
  end if;
  s := coalesce(p_at, r.preferred_at);
  if s < now() + interval '5 minutes' then raise exception 'Pick a time at least 5 minutes from now.' using errcode = 'P0001'; end if;
  e := s + make_interval(mins => r.duration_min);
  if exists (select 1 from public.mentor_requests x where x.id <> p_id and x.status = 'accepted' and (x.decided_by = auth.uid() or x.mentor_id = auth.uid()) and x.starts_at < e and s < x.ends_at) then
    raise exception 'You already have a 1:1 at that time. Pick another time.' using errcode = 'P0001';
  end if;
  update public.mentor_requests set status = 'accepted', note = nullif(trim(coalesce(p_note, '')), ''), starts_at = s, ends_at = e, decided_at = now(), decided_by = auth.uid() where id = p_id;
  perform public.notify(r.user_id, 'course', 'Mentorship confirmed', '“' || t || '” · ' || to_char(s at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MI AM') || ' (' || r.duration_min || ' min)', jsonb_build_object('pathname', '/mentorship'));
end $$;
grant execute on function public.mentor_respond(uuid, boolean, text, timestamptz) to authenticated;

create or replace function public.mentor_cancel(p_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.mentor_requests; learner boolean;
begin
  select * into r from public.mentor_requests where id = p_id for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  learner := r.user_id = auth.uid();
  if not learner and not public.can_mentor(r.tenant_id, r.course_id, r.mentor_id) then raise exception 'You can’t cancel this request.' using errcode = '42501'; end if;
  if r.status not in ('pending', 'accepted') then raise exception 'This request is already %.', r.status using errcode = 'P0001'; end if;
  if r.status = 'accepted' and r.starts_at <= now() then raise exception 'This session has already started.' using errcode = 'P0001'; end if;
  update public.mentor_requests set status = 'cancelled', decided_at = now(), note = coalesce(nullif(trim(coalesce(p_reason, '')), ''), note) where id = p_id;
  if learner then
    if r.mentor_id is null then perform public.notify_approvers(r.tenant_id, 'Mentorship cancelled by learner', 'A learner cancelled a 1:1 request.', jsonb_build_object('pathname', '/edu/mentorship'));
    else perform public.notify(r.mentor_id, 'course', 'Mentorship cancelled by learner', 'A learner cancelled a 1:1 request.', jsonb_build_object('pathname', '/edu/mentorship')); end if;
  else
    perform public.notify(r.user_id, 'course', 'Mentorship cancelled', coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Your tutor cancelled the 1:1.'), jsonb_build_object('pathname', '/mentorship'));
  end if;
end $$;
grant execute on function public.mentor_cancel(uuid, text) to authenticated;

/* ───────────── course-wide live classes: notify buyers ───────────── */
alter table public.live_sessions add column if not exists cancel_reason text;
create or replace function public.live_notify_buyers() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  select title into t from public.courses where id = new.course_id;
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, kind, title, body, link)
      select e.user_id, 'live', 'New live class scheduled', coalesce(t, 'Your course') || ': ' || new.title || ' · ' || to_char(new.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MI AM'), '{"pathname":"/live"}'::jsonb
        from public.enrollments e where e.course_id = new.course_id and (e.valid_till is null or e.valid_till > now());
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    insert into public.notifications (user_id, kind, title, body, link)
      select e.user_id, 'live', 'Live class cancelled', coalesce(t, 'Your course') || ': ' || new.title || coalesce(' — ' || new.cancel_reason, ''), '{"pathname":"/live"}'::jsonb
        from public.enrollments e where e.course_id = new.course_id and (e.valid_till is null or e.valid_till > now());
  end if;
  return new;
end $$;
drop trigger if exists live_notify on public.live_sessions;
create trigger live_notify after insert or update of status on public.live_sessions for each row execute function public.live_notify_buyers();

/* ───────────── teaching reminders ───────────── */
create table if not exists public.teaching_reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  kind        text not null check (kind in ('course_update','quiz','assignment','deadline','other')),
  title       text not null check (length(trim(title)) between 3 and 80),
  note        text check (note is null or length(note) <= 300),
  due_at      timestamptz not null,
  course_id   uuid references public.courses(id) on delete set null,
  done        boolean not null default false,
  notified    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists reminders_user_idx on public.teaching_reminders (user_id, done, due_at);

/* Due within a day → notify once (schedule with pg_cron every 15 min: select public.send_due_reminders();). */
create or replace function public.send_due_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with due as (update public.teaching_reminders set notified = true where not done and not notified and due_at < now() + interval '1 day' returning user_id, title, due_at)
  insert into public.notifications (user_id, kind, title, body, link) select user_id, 'system', 'Reminder: ' || title, 'Due ' || to_char(due_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH12:MI AM'), '{"pathname":"/edu/timetable"}'::jsonb from due;
  get diagnostics n = row_count;
  return n;
end $$;

/* ───────────── academy categories ("Other") ───────────── */
create table if not exists public.academy_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null check (length(trim(name)) between 3 and 40),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create unique index if not exists academy_categories_name on public.academy_categories (tenant_id, lower(trim(name)));

/* ───────────── tutors create courses; owner-only fields ───────────── */
create or replace function public.tutor_create_course(p_tenant uuid, p_title text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_tenant_role(p_tenant, array['owner', 'tutor']) then raise exception 'Only educators of this academy can create courses.' using errcode = '42501'; end if;
  if public.tenant_locked(p_tenant) then raise exception 'Your free trial or plan has ended. Choose a plan to keep teaching.' using errcode = 'P0001'; end if;
  insert into public.courses (tenant_id, tutor_id, title, price_paise, status, visibility) values (p_tenant, auth.uid(), coalesce(nullif(trim(p_title), ''), 'Untitled course'), 0, 'draft', 'private') returning courses.id into v_id;
  insert into public.course_tutors (course_id, user_id) values (v_id, auth.uid()) on conflict do nothing;
  return v_id;
end $$;
grant execute on function public.tutor_create_course(uuid, text) to authenticated;

create or replace function public.guard_tutor_course_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.has_tenant_role(new.tenant_id, array['owner']) or public.is_staff() or auth.uid() is null then return new; end if;
  if new.price_paise is distinct from old.price_paise or new.status is distinct from old.status or new.visibility is distinct from old.visibility then
    raise exception 'Only the workspace owner can change pricing and publishing.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_tutor_course_fields on public.courses;
create trigger guard_tutor_course_fields before update on public.courses for each row execute function public.guard_tutor_course_fields();

/* ───────────── security (RLS) ───────────── */
alter table public.quiz_attempts enable row level security;
alter table public.certificates enable row level security;
alter table public.cert_settings enable row level security;
alter table public.course_cert_rules enable row level security;
alter table public.cert_requests enable row level security;
alter table public.cert_designs enable row level security;
alter table public.mentor_requests enable row level security;
alter table public.teaching_reminders enable row level security;
alter table public.academy_categories enable row level security;

drop policy if exists "own attempts" on public.quiz_attempts;
create policy "own attempts" on public.quiz_attempts for select using (user_id = auth.uid() or public.can_edit_course(course_id));
drop policy if exists "take quiz" on public.quiz_attempts;
create policy "take quiz" on public.quiz_attempts for insert with check (user_id = auth.uid() and public.is_enrolled(course_id));
-- (real scoring: an edge function computes score_pct server-side and inserts with the service role)

drop policy if exists "read certificates" on public.certificates;
create policy "read certificates" on public.certificates for select using (user_id = auth.uid() or public.is_cert_approver(tenant_id) or public.is_tenant_staff(tenant_id));
-- issued only by cert_check / cert_decide (no direct insert policy); public verification goes through an edge function by ID.

drop policy if exists "approver settings" on public.cert_settings;
create policy "approver settings" on public.cert_settings for all using (public.is_cert_approver(tenant_id)) with check (public.is_cert_approver(tenant_id));
drop policy if exists "approver rules" on public.course_cert_rules;
create policy "approver rules" on public.course_cert_rules for all
  using (public.is_cert_approver((select tenant_id from public.courses c where c.id = course_id)))
  with check (public.is_cert_approver((select tenant_id from public.courses c where c.id = course_id)));
drop policy if exists "read cert requests" on public.cert_requests;
create policy "read cert requests" on public.cert_requests for select using (user_id = auth.uid() or public.is_cert_approver(tenant_id));
drop policy if exists "approver designs" on public.cert_designs;
create policy "approver designs" on public.cert_designs for all using (public.is_cert_approver(tenant_id)) with check (public.is_cert_approver(tenant_id));

drop policy if exists "read mentorship" on public.mentor_requests;
create policy "read mentorship" on public.mentor_requests for select using (user_id = auth.uid() or public.can_mentor(tenant_id, course_id, mentor_id));
-- all writes through mentor_request / mentor_respond / mentor_cancel

drop policy if exists "own reminders" on public.teaching_reminders;
create policy "own reminders" on public.teaching_reminders for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (public.is_tenant_staff(tenant_id) or (tenant_id = public.bodhin_tenant() and public.is_staff())));

drop policy if exists "read academy categories" on public.academy_categories;
create policy "read academy categories" on public.academy_categories for select using (public.is_tenant_staff(tenant_id) or public.is_staff());
drop policy if exists "staff add category" on public.academy_categories;
create policy "staff add category" on public.academy_categories for insert with check (public.is_tenant_staff(tenant_id) and created_by = auth.uid());


/* ───────────── index every new foreign key (same block as 0008) ───────────── */
do $$
declare r record; idx text;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conrelid, c.conkey,
           string_agg(a.attname, ',' order by k.ord) as cols,
           string_agg(quote_ident(a.attname), ', ' order by k.ord) as qcols
      from pg_constraint c
      cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     group by c.oid, c.conrelid, c.conkey
  loop
    -- skip when an existing index already starts with these columns (in this order)
    if not exists (
      select 1 from pg_index i
       where i.indrelid = r.conrelid
         and (i.indkey::int2[])[0:array_length(r.conkey, 1) - 1] = r.conkey
    ) then
      idx := left('fk_' || replace(r.tbl::text, 'public.', '') || '_' || replace(r.cols, ',', '_'), 63);
      execute format('create index if not exists %I on %s (%s)', idx, r.tbl, r.qcols);
    end if;
  end loop;
end $$;
