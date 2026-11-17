-- Server-side domain restriction. Fails closed; exact domain only; display name from Google once.
begin;

do $$
declare v_id uuid;
begin
  -- Allowed domain and verified email
  perform test.assert(private.signup_allowed('someone@example.test', true), 'allowed domain with verified email');
  perform test.assert(private.signup_allowed('  SomeOne@EXAMPLE.test ', true), 'case and whitespace are normalised');
  -- Everything else is refused
  perform test.assert(not private.signup_allowed('someone@gmail.com', true), 'other domain refused');
  perform test.assert(not private.signup_allowed('someone@sub.example.test', true), 'sub-domain refused');
  perform test.assert(not private.signup_allowed('someone@example.test.evil.com', true), 'suffix trick refused');
  perform test.assert(not private.signup_allowed('example.test', true), 'no @ refused');
  perform test.assert(not private.signup_allowed('a@b@example.test', true), 'two @ refused');
  perform test.assert(not private.signup_allowed('someone@example.test', false), 'unverified email refused');
  perform test.assert(not private.signup_allowed('someone@example.test', null), 'unknown verification refused');
  perform test.assert(not private.signup_allowed(null, true), 'null email refused');

  -- Fail closed: with no domain configured, nobody can sign up
  delete from private.settings where key = 'allowed_email_domain';
  perform test.assert(not private.signup_allowed('someone@example.test', true), 'no configured domain means refuse everything');
  insert into private.settings (key, value) values ('allowed_email_domain', '');
  perform test.assert(not private.signup_allowed('someone@example.test', true), 'an empty domain means refuse everything');
  update private.settings set value = '@example.test' where key = 'allowed_email_domain';
  perform test.assert(private.signup_allowed('someone@example.test', true), 'a leading @ in the setting is tolerated');
  update private.settings set value = 'example.test' where key = 'allowed_email_domain';
end $$;

-- The trigger on auth.users is the guarantee, so it still holds if the Auth hook is not enabled
do $$
declare v_id uuid := gen_random_uuid();
begin
  perform test.expect_error($f$ insert into auth.users (email, email_confirmed_at) values ('x@gmail.com', now()) $f$, 'signup_not_allowed');
  perform test.expect_error($f$ insert into auth.users (email) values ('x@example.test') $f$, 'signup_not_allowed');
  perform test.assert(not exists (select 1 from auth.users where email in ('x@gmail.com', 'x@example.test')), 'refused sign-ups leave no auth row');

  -- SECURITY (migration 011): a client-supplied email_verified flag is NOT proof of verification
  perform test.expect_error($f$ insert into auth.users (email, raw_user_meta_data) values ('forged@example.test', '{"email_verified":true}') $f$, 'signup_not_allowed');
  perform test.expect_error($f$ insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ('emailprov@example.test', '{"provider":"email"}', '{"email_verified":true}') $f$, 'signup_not_allowed');
  perform test.expect_error($f$ insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ('g.unverified@example.test', '{"provider":"google"}', '{"email_verified":false}') $f$, 'signup_not_allowed');
  perform test.expect_error($f$ insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ('g.other@gmail.com', '{"provider":"google"}', '{"email_verified":true}') $f$, 'signup_not_allowed');

  -- A Google identity (server-written provider) with Google's verified claim is accepted
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (v_id, 'meta.verified@example.test', '{"provider":"google","providers":["google"]}', '{"email_verified":true,"name":"Meta Name Synthetic"}');
  perform test.assert((select full_name from public.profiles where id = v_id) = 'Meta Name Synthetic', 'the Google name is copied at registration');
  perform test.assert((select domain_verified from public.profiles where id = v_id), 'domain_verified is set');
  perform test.assert((select role from public.profiles where id = v_id) = 'student', 'new accounts are students');

  -- No name from Google: a neutral placeholder, never the email local part (it may hold a USN)
  insert into auth.users (id, email, email_confirmed_at)
  values ('b0000000-0000-4000-8000-000000000001', '1rn00zz999@example.test', now());
  perform test.assert((select full_name from public.profiles where id = 'b0000000-0000-4000-8000-000000000001') = 'RNSIT member', 'placeholder name instead of the email local part');
  perform test.assert(not exists (select 1 from public.profiles where full_name ~* '1rn'), 'no USN-like name was created');
end $$;

-- The hook wrapper agrees with the same rule
do $$
begin
  perform test.assert(public.hook_before_user_created('{"user":{"email":"a@example.test","app_metadata":{"provider":"google"},"user_metadata":{"email_verified":true}}}'::jsonb) = '{}'::jsonb, 'hook allows a verified Google user');
  perform test.assert(public.hook_before_user_created('{"user":{"email":"a@gmail.com","app_metadata":{"provider":"google"},"user_metadata":{"email_verified":true}}}'::jsonb) ? 'error', 'hook rejects another domain');
  perform test.assert(public.hook_before_user_created('{"user":{"email":"a@example.test","user_metadata":{"email_verified":true}}}'::jsonb) ? 'error', 'hook rejects forged metadata without the google provider');
  perform test.assert(public.hook_before_user_created('{"user":{"email":"a@example.test","app_metadata":{"provider":"email"},"user_metadata":{"email_verified":true}}}'::jsonb) ? 'error', 'hook rejects the email provider');
  perform test.assert(public.hook_before_user_created('{"user":{"email":"a@example.test","user_metadata":{}}}'::jsonb) ? 'error', 'hook rejects an unverified email');
end $$;

rollback;
