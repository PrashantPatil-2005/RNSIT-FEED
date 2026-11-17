-- USN ownership disputes cannot bypass verification (decision U10). A USN alone is never proof.
begin;

-- Direct constraints: uppercase TEXT, exact format, unique
do $$
begin
  perform test.expect_error($f$ insert into private.profile_private (user_id, usn) values (test.claimant(), '1RN23CS01') $f$, 'check');
  perform test.expect_error($f$ insert into private.profile_private (user_id, usn) values (test.claimant(), '2RN23CS001') $f$, 'check');
  perform test.expect_error($f$ insert into private.profile_private (user_id, usn) values (test.claimant(), '1RN23C5001') $f$, 'check');
  perform test.expect_error($f$ insert into private.profile_private (user_id, usn) values (test.claimant(), '1RN2023CS001') $f$, 'check');
  perform test.expect_error($f$ insert into private.profile_private (user_id, usn) values (test.claimant(), '1RN23CS0011') $f$, 'check');
  perform test.expect_error($f$ insert into private.profile_private (user_id, usn) values (test.claimant(), '1RN23ÇS001') $f$, 'check');
  -- Duplicate, including a lower-case variant (normalised to the same value)
  perform test.expect_error($f$ insert into private.profile_private (user_id, usn) values (test.claimant(), '1rn00zz001') $f$, 'duplicate key');
  -- Normalisation: lower case and padding are stored as clean upper case
  insert into private.profile_private (user_id, usn) values (test.claimant(), '  1rn00zz006  ');
  perform test.assert((select usn from private.profile_private where user_id = test.claimant()) = '1RN00ZZ006', 'USN is stored upper-case and trimmed');
  delete from private.profile_private where user_id = test.claimant();
  -- 000 is accepted: no assumption about how serials are numbered
  insert into private.profile_private (user_id, usn) values (test.claimant(), '1RN24EC000');
  delete from private.profile_private where user_id = test.claimant();
end $$;

-- Onboarding cannot take a USN that is already held, and reveals nothing about the holder
do $$
declare v_res text;
begin
  perform test.as_user(test.claimant());
  perform test.expect_error($f$ select public.complete_onboarding(1::smallint, 1::smallint, 'not-a-usn') $f$, 'invalid_usn');
  v_res := public.complete_onboarding(1::smallint, 1::smallint, '1rn00zz001');
  perform test.assert(v_res = 'usn_unavailable', 'a held USN cannot be claimed during onboarding');
  perform test.assert((select onboarded_at from public.profiles where id = test.claimant()) is null, 'claimant is not onboarded by the failed attempt');
  perform test.assert(public.get_my_usn() is null, 'claimant did not obtain the USN');
  perform test.reset();
end $$;

-- Release is OFF by default and until the evidence procedure exists (decision U10)
do $$
declare v_case uuid;
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values ('a0000000-0000-4000-8000-000000000008', 'synthetic.claimant3@example.test', now(), '{"full_name":"Synthetic Claimant Three"}');
  perform test.as_user('a0000000-0000-4000-8000-000000000008');
  v_case := (public.request_usn_review('1RN00ZZ002') ->> 'case_id')::uuid;   -- Bob's USN
  perform test.reset();
  update private.settings set value = 'false' where key = 'usn_release_enabled';
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_usn_case_take(%L, true, 'Synthetic reason for test') $f$, v_case), 'usn_release_disabled');
  perform test.expect_error(format($f$ select public.admin_usn_case_notify(%L, 'Synthetic reason for test') $f$, v_case), 'usn_release_disabled');
  perform test.expect_error(format($f$ select public.admin_usn_case_approve(%L, 'Synthetic reason for test', 'college-record', 'REF-0002', true) $f$, v_case), 'usn_release_disabled');
  perform test.expect_error(format($f$ select public.admin_usn_case_execute(%L, 'Synthetic reason for test') $f$, v_case), 'usn_release_disabled');
  perform public.admin_usn_case_deny(v_case, 'Synthetic: procedure not yet enabled');   -- closing is always allowed
  perform test.reset();
  delete from private.settings where key = 'usn_release_enabled';
  perform test.as_user(test.admin_x());
  perform test.assert((select count(*) from public.my_notices) = 0, 'no notice was created while disabled');
  perform test.reset();
  perform test.assert(exists (select 1 from private.profile_private where user_id = test.bob() and usn = '1RN00ZZ002'), 'nothing moved while disabled');
  insert into private.settings (key, value) values ('usn_release_enabled', 'true');
end $$;

-- Full dispute flow, with every safeguard
do $$
declare
  v_case uuid;
  v_status jsonb;
  v_alice_post uuid;
begin
  v_alice_post := test.make_approved(test.alice(), false);

  perform test.as_user(test.claimant());
  v_status := public.request_usn_review('1RN00ZZ001');
  perform test.assert(v_status ->> 'status' = 'opened', 'claimant can open a review');
  v_case := (v_status ->> 'case_id')::uuid;
  perform test.assert((public.request_usn_review('1RN00ZZ001') ->> 'status') = 'case_exists', 'only one live case per claimant');
  perform test.assert((public.request_usn_review('1RN24EC999') ->> 'status') = 'usn_available', 'a free USN needs no dispute');
  perform test.reset();

  -- A plain student and a moderator cannot act on the case
  perform test.as_user(test.bob());
  perform test.expect_error(format($f$ select public.admin_usn_case_take(%L, true, 'Synthetic reason for test') $f$, v_case), 'forbidden');
  perform test.reset();
  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.admin_usn_case_execute(%L, 'Synthetic reason for test') $f$, v_case), 'forbidden');
  perform test.reset();

  -- Steps cannot be skipped
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_usn_case_execute(%L, 'Synthetic reason for test') $f$, v_case), 'invalid_state');
  perform test.expect_error(format($f$ select public.admin_usn_case_approve(%L, 'Synthetic reason for test', 'college-record', 'REF-0001', true) $f$, v_case), 'invalid_state');
  perform test.expect_error(format($f$ select public.admin_usn_case_notify(%L, 'Synthetic reason for test') $f$, v_case), 'invalid_state');
  perform test.expect_error(format($f$ select public.admin_usn_case_take(%L, false, 'Synthetic reason for test') $f$, v_case), 'conflict_attestation_required');
  perform public.admin_usn_case_take(v_case, true, 'Synthetic review started for test');
  perform test.expect_error(format($f$ select public.admin_usn_case_execute(%L, 'Synthetic reason for test') $f$, v_case), 'invalid_state');
  perform public.admin_usn_case_notify(v_case, 'Synthetic holder notice for test');
  -- Evidence is mandatory and the objection window must pass
  perform test.expect_error(format($f$ select public.admin_usn_case_approve(%L, 'Synthetic reason for test', '', '', true) $f$, v_case), 'evidence_required');
  perform test.expect_error(format($f$ select public.admin_usn_case_approve(%L, 'Synthetic reason for test', 'college-record', 'REF-0001', true) $f$, v_case), 'objection_window_open');
  perform test.reset();

  -- The current holder is notified and can object; the claimant cannot read the holder's notice
  perform test.as_user(test.alice());
  perform test.assert((select count(*) from public.my_notices where kind = 'usn_dispute_opened' and ref_id = v_case) = 1, 'holder is notified');
  perform test.reset();
  perform test.as_user(test.claimant());
  perform test.assert((select count(*) from public.my_notices) = 0, 'claimant cannot read the holder notice');
  perform test.expect_error(format($f$ select public.object_to_usn_release(%L) $f$, v_case), 'not_found');
  perform test.reset();
  perform test.as_user(test.alice());
  perform public.object_to_usn_release(v_case);
  perform test.reset();

  -- Contested: the reviewing admin cannot approve; a different admin must
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_usn_case_approve(%L, 'Synthetic reason for test', 'college-record', 'REF-0001', true) $f$, v_case), 'second_admin_required');
  perform test.reset();
  perform test.as_user(test.admin_y());
  perform test.expect_error(format($f$ select public.admin_usn_case_approve(%L, 'Synthetic reason for test', 'college-record', 'REF-0001', false) $f$, v_case), 'conflict_attestation_required');
  perform public.admin_usn_case_approve(v_case, 'Synthetic institutional confirmation for test', 'college-record', 'REF-0001', true);
  perform test.reset();

  -- Execute: atomic transfer, audited, holder must re-enter a USN, posts stay
  perform test.as_user(test.admin_y());
  perform public.admin_usn_case_execute(v_case, 'Synthetic execution for test');
  perform test.expect_error(format($f$ select public.admin_usn_case_execute(%L, 'Synthetic reason for test') $f$, v_case), 'invalid_state');
  perform test.reset();

  perform test.assert((select usn from private.profile_private where user_id = test.claimant()) = '1RN00ZZ001', 'USN moved to the verified claimant');
  perform test.assert(not exists (select 1 from private.profile_private where user_id = test.alice()), 'former holder no longer has the USN');
  perform test.assert((select onboarded_at from public.profiles where id = test.alice()) is null, 'former holder must re-onboard before posting');
  perform test.assert((select status from public.experiences where id = v_alice_post) = 'approved', 'former holder posts remain');
  perform test.as_user(test.alice());
  perform test.expect_error($f$ select public.save_draft(null, null, '{}'::jsonb) $f$, 'onboarding_required');
  perform test.assert((select count(*) from public.my_notices where kind = 'usn_released') = 1, 'former holder is told');
  perform test.reset();

  -- Audit: every step logged, none holds a USN value
  perform test.assert((select count(*) from private.admin_audit where case_id = v_case) = 4, 'take, notify, approve and execute are audited');
  perform test.assert(not exists (select 1 from private.admin_audit where to_jsonb(admin_audit)::text ~ '1RN[0-9]{2}'), 'no USN value in the admin audit');
  perform test.assert((select verification_method from private.admin_audit where action = 'approve_usn_case') = 'college-record', 'verification method is recorded');
end $$;

-- A conflicted admin (the holder) can never act on a case about their own USN
do $$
declare v_case uuid;
begin
  -- A fresh, un-onboarded synthetic user (the earlier claimant now holds a USN)
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values ('a0000000-0000-4000-8000-000000000007', 'synthetic.claimant2@example.test', now(), '{"full_name":"Synthetic Claimant Two"}');
  perform test.as_user('a0000000-0000-4000-8000-000000000007');
  v_case := (public.request_usn_review('1RN00ZZ004') ->> 'case_id')::uuid;   -- admin X's USN
  perform test.reset();
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_usn_case_take(%L, true, 'Synthetic reason for test') $f$, v_case), 'conflict');
  perform test.expect_error(format($f$ select public.admin_usn_case_deny(%L, 'Synthetic reason for test') $f$, v_case), 'conflict');
  perform test.reset();
  -- The other admin may deny; if ownership cannot be shown nothing moves
  perform test.as_user(test.admin_y());
  perform public.admin_usn_case_take(v_case, true, 'Synthetic review started for test');
  perform public.admin_usn_case_deny(v_case, 'Synthetic: ownership could not be shown');
  perform test.expect_error(format($f$ select public.admin_usn_case_execute(%L, 'Synthetic reason for test') $f$, v_case), 'invalid_state');
  perform test.reset();
  perform test.assert(exists (select 1 from private.profile_private where user_id = test.admin_x() and usn = '1RN00ZZ004'), 'a denied case leaves the USN with the holder');
end $$;

rollback;
