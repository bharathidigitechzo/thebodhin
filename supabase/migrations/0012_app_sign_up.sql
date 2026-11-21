-- Sign-up without a confirmation email.
-- Supabase's built-in mailer sends only a few emails an hour, so `auth.signUp` with "Confirm email" on
-- failed for every new learner/educator ("email rate limit exceeded"). Accounts are created here instead,
-- already confirmed, and the app signs in with the password straight after. Passwords are bcrypt-hashed
-- exactly like Supabase Auth does, so normal email + password sign-in works on every device.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.app_sign_up(p_email text, p_password text, p_meta jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(coalesce(p_email, 
  
  '')));
  -- Only display fields; never anything that decides identity or roles.
  v_meta jsonb := jsonb_strip_nulls(jsonb_build_object(
    'name', left(trim(p_meta->>'name'), 80),
    'phone', left(trim(p_meta->>'phone'), 20),
    'role', case when p_meta->>'role' in ('student', 'tutor') then p_meta->>'role' end));
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 6 or length(p_password) > 72 then
    raise exception 'Use a password of 6 to 72 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'email_taken' using errcode = '23505';
  end if;
  -- Simple flood guard (the mailer limit used to be the only throttle).
  if (select count(*) from auth.users where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'busy' using errcode = '53400';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, v_meta, now(), now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now());
  return v_id;
end $$;

revoke execute on function public.app_sign_up(text, text, jsonb) from public;
grant execute on function public.app_sign_up(text, text, jsonb) to anon, authenticated;
