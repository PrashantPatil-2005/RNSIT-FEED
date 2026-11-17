-- Alumni invites (decision U3): admin-only, single use, Google-verified only, expiring, audited by
-- invite id without the email, and the email is not kept once the invite is closed.
begin;

-- Only admins can invite, revoke or list
do $$
declare v_uid uuid;
begin
  perform test.as_anon();
  perform test.expect_error($f$ select public.admin_invite_alumnus('alum.anon@gmail.com', 'Known alumnus, synthetic batch') $f$, 'permission denied');
  perform test.expect_error($f$ select * from public.admin_list_alumni_invites() $f$, 'permission denied');
  perform test.reset();
  foreach v_uid in array array[test.alice(), test.moderator()] loop
    perform test.as_user(v_uid);
    perform test.expect_error($f$ select public.admin_invite_alumnus('alum.member@gmail.com', 'Known alumnus, synthetic batch') $f$, 'forbidden');
    perform test.expect_error($f$ select public.admin_revoke_alumni_invite(gen_random_uuid(), 'Revoking a synthetic invite') $f$, 'forbidden');
    perform test.expect_error($f$ select * from public.admin_list_alumni_invites() $f$, 'forbidden');
    perform test.expect_error($f$ select * from private.alumni_invites $f$, 'permission denied');
    perform test.reset();
  end loop;
  perform test.assert(not exists (select 1 from private.alumni_invites), 'refused calls created no invite');
end $$;

-- Input rules for invites
do $$
declare v_id uuid;
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.admin_invite_alumnus('alum.one@gmail.com', 'short') $f$, 'reason_required');
  perform test.expect_error($f$ select public.admin_invite_alumnus('alum.one@gmail.com', 'Invite for alum.one@gmail.com please') $f$, 'reason_has_email');
  perform test.expect_error($f$ select public.admin_invite_alumnus('not-an-email', 'Known alumnus, synthetic batch') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_invite_alumnus('a@b@gmail.com', 'Known alumnus, synthetic batch') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_invite_alumnus(null, 'Known alumnus, synthetic batch') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_invite_alumnus('someone@example.test', 'College address needs no invite') $f$, 'not_needed');
  perform test.expect_error($f$ select public.admin_invite_alumnus('synthetic.alice@example.test', 'Existing member address here') $f$, 'not_needed');
  v_id := public.admin_invite_alumnus('  Alum.One@Gmail.com ', 'Known alumnus, synthetic batch');
  perform test.expect_error($f$ select public.admin_invite_alumnus('alum.one@gmail.com', 'Second invite for the same alumnus') $f$, 'already_invited');
  perform test.reset();

  perform test.assert((select email from private.alumni_invites where id = v_id) = 'alum.one@gmail.com', 'email stored normalised');
  perform test.assert((select expires_at from private.alumni_invites where id = v_id) between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour', 'default expiry is 14 days');
  perform test.assert(exists (select 1 from private.admin_audit where action = 'invite_alumnus' and evidence_ref = 'alumni_invite:' || v_id and actor_id = test.admin_x()), 'invite audited by id');
  perform test.assert(not exists (select 1 from private.admin_audit a where to_jsonb(a)::text ilike '%alum.one%' or to_jsonb(a)::text like '%@%'), 'the audit log holds no email');

  perform test.as_user(test.admin_x());
  perform test.assert((select email_masked from public.admin_list_alumni_invites() where id = v_id) = 'a***@gmail.com', 'list shows a masked address');
  perform test.assert((select status from public.admin_list_alumni_invites() where id = v_id) = 'open', 'new invite is open');
  perform test.reset();
end $$;

-- Sign-up rule: only an open invite for the exact address, and still Google-verified only
do $$
declare v_id uuid := gen_random_uuid();
begin
  perform test.assert(private.signup_allowed('alum.one@gmail.com', true), 'invited address allowed when verified');
  perform test.assert(private.signup_allowed('  ALUM.ONE@gmail.com ', true), 'invited address normalised');
  perform test.assert(not private.signup_allowed('alum.one@gmail.com', false), 'invite never bypasses verification');
  perform test.assert(not private.signup_allowed('alum.two@gmail.com', true), 'uninvited Gmail still refused');
  perform test.assert(not private.signup_allowed('alum.one@gmail.com.evil.test', true), 'suffix trick refused');

  -- Fail closed: no configured domain means nobody, invited or not
  update private.settings set value = '' where key = 'allowed_email_domain';
  perform test.assert(not private.signup_allowed('alum.one@gmail.com', true), 'no configured domain refuses invites too');
  update private.settings set value = 'example.test' where key = 'allowed_email_domain';

  -- Forged verification on the invited address is refused and leaves the invite open
  perform test.expect_error($f$ insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ('alum.one@gmail.com', '{"provider":"email"}', '{"email_verified":true}') $f$, 'signup_not_allowed');
  perform test.expect_error($f$ insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ('alum.one@gmail.com', '{"provider":"google"}', '{"email_verified":false}') $f$, 'signup_not_allowed');
  perform test.assert(private.open_alumni_invite('alum.one@gmail.com') is not null, 'invite still open after refused attempts');

  -- The Auth hook agrees
  perform test.assert(public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object(
    'email', 'alum.one@gmail.com', 'app_metadata', '{"provider":"google"}'::jsonb, 'user_metadata', '{"email_verified":true}'::jsonb))) = '{}'::jsonb,
    'hook accepts the invited, verified address');
  perform test.assert(public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object(
    'email', 'alum.two@gmail.com', 'app_metadata', '{"provider":"google"}'::jsonb, 'user_metadata', '{"email_verified":true}'::jsonb))) ? 'error',
    'hook refuses an uninvited address');

  -- A verified Google sign-up with the invite creates an alumni account and uses the invite up
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (v_id, 'alum.one@gmail.com', '{"provider":"google","providers":["google"]}', '{"email_verified":true,"name":"Synthetic Alumnus"}');
  perform test.assert((select role from public.profiles where id = v_id) = 'alumni', 'invited account is alumni');
  perform test.assert((select domain_verified from public.profiles where id = v_id), 'invited account is an eligible member');
  perform test.assert(exists (select 1 from private.alumni_invites where used_by = v_id and used_at is not null and email is null), 'invite used and its email cleared');
  perform test.assert(not private.signup_allowed('alum.one@gmail.com', true), 'a used invite cannot be reused');
  perform test.assert(not exists (select 1 from private.alumni_invites where email is not null and used_at is not null), 'no closed invite keeps an email');

  -- College-domain sign-ups are unchanged: students, no invite touched
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values ('b0000000-0000-4000-8000-0000000000a1', 'new.student@example.test', '{"provider":"google"}', '{"email_verified":true}');
  perform test.assert((select role from public.profiles where id = 'b0000000-0000-4000-8000-0000000000a1') = 'student', 'college sign-up is a student');

  -- An existing account cannot be invited
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.admin_invite_alumnus('alum.one@gmail.com', 'Inviting an existing account') $f$, 'already_registered');
  perform test.reset();
end $$;

-- Expiry and re-invite
do $$
declare v_old uuid; v_new uuid;
begin
  perform test.as_user(test.admin_x());
  v_old := public.admin_invite_alumnus('alum.late@gmail.com', 'Known alumnus, synthetic batch');
  perform test.reset();
  update private.alumni_invites set expires_at = now() - interval '1 minute' where id = v_old;
  perform test.assert(not private.signup_allowed('alum.late@gmail.com', true), 'expired invite refused');
  perform test.expect_error($f$ insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ('alum.late@gmail.com', '{"provider":"google"}', '{"email_verified":true}') $f$, 'signup_not_allowed');

  perform test.as_user(test.admin_x());
  perform test.assert((select status from public.admin_list_alumni_invites() where id = v_old) = 'expired', 'list shows expired');
  v_new := public.admin_invite_alumnus('alum.late@gmail.com', 'Fresh invite after expiry');
  perform test.reset();
  perform test.assert((select email from private.alumni_invites where id = v_old) is null, 're-invite clears the expired invite email');
  perform test.assert(private.signup_allowed('alum.late@gmail.com', true), 'fresh invite works');

  -- Purge clears emails of expired invites (service role only)
  update private.alumni_invites set expires_at = now() - interval '1 minute' where id = v_new;
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.purge_expired_alumni_invites() $f$, 'permission denied');
  perform test.reset();
  perform test.as_service();
  perform test.assert(public.purge_expired_alumni_invites() >= 1, 'purge cleared at least one expired invite');
  perform test.reset();
  perform test.assert((select email from private.alumni_invites where id = v_new) is null, 'expired invite email purged');
end $$;

-- Revoke
do $$
declare v_id uuid;
begin
  perform test.as_user(test.admin_x());
  v_id := public.admin_invite_alumnus('alum.revoked@gmail.com', 'Known alumnus, synthetic batch');
  perform test.expect_error(format($f$ select public.admin_revoke_alumni_invite(%L, 'Revoke for alum.revoked@gmail.com') $f$, v_id), 'reason_has_email');
  perform test.expect_error(format($f$ select public.admin_revoke_alumni_invite(%L, 'short') $f$, v_id), 'reason_required');
  perform public.admin_revoke_alumni_invite(v_id, 'Invite sent in error, revoked');
  perform test.expect_error(format($f$ select public.admin_revoke_alumni_invite(%L, 'Revoking a second time') $f$, v_id), 'not_found');
  perform test.assert((select status from public.admin_list_alumni_invites() where id = v_id) = 'revoked', 'list shows revoked');
  perform test.reset();
  perform test.assert(not private.signup_allowed('alum.revoked@gmail.com', true), 'revoked invite refused');
  perform test.assert((select email is null and revoked_by = test.admin_x() from private.alumni_invites where id = v_id), 'revoke clears the email and records the admin');
  perform test.assert(exists (select 1 from private.admin_audit where action = 'revoke_alumni_invite' and evidence_ref = 'alumni_invite:' || v_id), 'revoke audited by id');
  perform test.assert(not exists (select 1 from private.admin_audit a where to_jsonb(a)::text like '%@%'), 'the audit log still holds no email');

  -- Constraint backstop: a closed invite can never hold an email
  perform test.expect_error(format($f$ update private.alumni_invites set email = 'x@gmail.com' where id = %L $f$, v_id), 'alumni_invites_email_cleared');
end $$;

rollback;
