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
