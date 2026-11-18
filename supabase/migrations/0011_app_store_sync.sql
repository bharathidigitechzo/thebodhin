-- Shared app store: the APK, web portal, local dev and Vercel all read/write the same records
-- (see apps/student/src/api/cloud.ts). One row per record so devices merge instead of overwriting.
-- Signed-in users only; passwords live in Supabase Auth, never here.
-- Next step: move each collection onto the normalized tables (0001–0010) with per-user RLS.

create table if not exists public.app_store (
  field       text not null,
  key         text not null,
  ord         double precision not null default 0,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (field, key)
);
alter table public.app_store enable row level security;
drop policy if exists "signed-in read" on public.app_store;
create policy "signed-in read" on public.app_store for select to authenticated using (true);
drop policy if exists "signed-in insert" on public.app_store;
create policy "signed-in insert" on public.app_store for insert to authenticated with check (true);
drop policy if exists "signed-in update" on public.app_store;
create policy "signed-in update" on public.app_store for update to authenticated using (true) with check (true);
drop policy if exists "signed-in delete" on public.app_store;
create policy "signed-in delete" on public.app_store for delete to authenticated using (true);

create or replace function public.app_store_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists app_store_touch on public.app_store;
create trigger app_store_touch before insert or update on public.app_store for each row execute function public.app_store_touch();

-- Sign in with a mobile number: find the account's email.
create or replace function public.login_email(p_phone text) returns text
language sql stable security definer set search_path = '' as $$
  select data->>'email' from public.app_store
   where field = 'users' and right(regexp_replace(coalesce(data->>'phone', ''), '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
   limit 1;
$$;
revoke execute on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;
