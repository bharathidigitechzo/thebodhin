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
