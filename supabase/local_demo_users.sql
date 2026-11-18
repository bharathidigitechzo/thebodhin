-- Demo users for local PostgreSQL
DO $$
DECLARE
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_rajesh_id uuid := 'a0000000-0000-0000-0000-000000000002';
  v_meera_id uuid := 'a0000000-0000-0000-0000-000000000003';
  v_arjun_id uuid := 'a0000000-0000-0000-0000-000000000004';
  v_tenant_id uuid := md5('t_bodhin')::uuid;
BEGIN
  -- Insert into auth.users
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES 
    (v_admin_id, 'admin@demo.in', '{"name":"Admin Bodhin","role":"super_admin"}'::jsonb),
    (v_rajesh_id, 'rajesh@demo.in', '{"name":"Rajesh Kumar","role":"educator"}'::jsonb),
    (v_meera_id, 'meera@demo.in', '{"name":"Meera Sharma","role":"tutor"}'::jsonb),
    (v_arjun_id, 'arjun@demo.in', '{"name":"Arjun Patel","role":"student"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- Insert into public.profiles
  INSERT INTO public.profiles (id, name, staff_role)
  VALUES
    (v_admin_id, 'Admin Bodhin', 'super_admin'),
    (v_rajesh_id, 'Rajesh Kumar', NULL),
    (v_meera_id, 'Meera Sharma', NULL),
    (v_arjun_id, 'Arjun Patel', NULL)
  ON CONFLICT (id) DO UPDATE SET staff_role = EXCLUDED.staff_role;

  -- Insert memberships for tenant
  INSERT INTO public.memberships (user_id, tenant_id, role)
  VALUES
    (v_rajesh_id, v_tenant_id, 'owner'),
    (v_meera_id, v_tenant_id, 'tutor')
  ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

END $$;
