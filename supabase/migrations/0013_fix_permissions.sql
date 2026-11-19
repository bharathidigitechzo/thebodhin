-- ════════════════════════════════════════════════════════════════════
-- Bodhin · 0013 — Grant Table & Sequence Permissions to API Roles
-- Fixes: "permission denied for table app_store / profiles / memberships"
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/pfjlpcrextppuixgriot/sql
-- ════════════════════════════════════════════════════════════════════

-- 1. Grant schema usage
grant usage on schema public to anon, authenticated, service_role;

-- 2. Grant table permissions on all existing public tables
grant all on all tables in schema public to anon, authenticated, service_role;

-- 3. Grant sequence permissions on all existing sequences
grant all on all sequences in schema public to anon, authenticated, service_role;

-- 4. Grant routine/function execution permissions
grant all on all routines in schema public to anon, authenticated, service_role;

-- 5. Set default privileges so future tables automatically have permissions
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;

-- 6. Ensure app_store has permissive RLS policies for authenticated and anon users
alter table if exists public.app_store enable row level security;

drop policy if exists "app_store_select" on public.app_store;
create policy "app_store_select" on public.app_store for select to anon, authenticated using (true);

drop policy if exists "app_store_insert" on public.app_store;
create policy "app_store_insert" on public.app_store for insert to anon, authenticated with check (true);

drop policy if exists "app_store_update" on public.app_store;
create policy "app_store_update" on public.app_store for update to anon, authenticated using (true) with check (true);

drop policy if exists "app_store_delete" on public.app_store;
create policy "app_store_delete" on public.app_store for delete to anon, authenticated using (true);
