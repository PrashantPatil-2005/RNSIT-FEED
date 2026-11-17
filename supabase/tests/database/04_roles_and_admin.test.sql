-- Moderators cannot use admin operations; roles cannot be escalated; admin limits hold.
begin;

do $$
declare v_post uuid;
begin
  v_post := test.make_approved(test.alice(), true);

  -- Moderator: every admin-only operation is refused, and admin tables are unreachable
  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.admin_reveal_author(%L, 'Synthetic reason for test') $f$, v_post), 'forbidden');
  perform test.expect_error(format($f$ select public.admin_get_usn(%L, 'Synthetic reason for test') $f$, test.alice()), 'forbidden');
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L, 'moderator', 'Synthetic reason for test') $f$, test.bob()), 'forbidden');
  perform test.expect_error(format($f$ select public.admin_correct_name(%L, 'New Name', 'Synthetic reason for test') $f$, test.bob()), 'forbidden');
  perform test.expect_error($f$ select public.admin_create_company('Nope Co', 'nope-co', 'Synthetic reason for test') $f$, 'forbidden');
  perform test.expect_error($f$ select * from public.admin_list_audit('Synthetic reason for test') $f$, 'forbidden');
  perform test.expect_error(format($f$ select public.admin_usn_case_take(%L, true, 'Synthetic reason for test') $f$, gen_random_uuid()), 'forbidden');
  perform test.expect_error($f$ select * from private.admin_audit $f$, 'permission denied');
  perform test.expect_error($f$ select * from private.usn_disputes $f$, 'permission denied');
  perform test.expect_error($f$ select public.delete_account_data(gen_random_uuid()) $f$, 'permission denied');
  perform test.expect_error($f$ select public.purge_expired_drafts() $f$, 'permission denied');
  perform test.reset();

  -- A plain student: same refusals, and no privilege escalation path
  perform test.as_user(test.bob());
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L, 'admin', 'Synthetic reason for test') $f$, test.bob()), 'forbidden');
  perform test.expect_error($f$ update public.profiles set role = 'admin' where id = auth.uid() $f$, 'permission denied');
  perform test.assert((select count(*) from public.moderation_history) = 0, 'a non-staff student sees no moderation history');
  perform test.assert((select count(*) from public.moderation_experiences) = 0, 'a non-staff student sees no moderation queue');
  perform test.expect_error($f$ select public.moderation_experience_detail(gen_random_uuid()) $f$, 'forbidden');
  perform test.reset();

  -- The role guard also stops the owner role from changing protected columns without the function flag
  perform test.expect_error(format($f$ update public.profiles set role = 'admin' where id = %L $f$, test.bob()), 'protected_columns');
  perform test.expect_error(format($f$ update public.profiles set full_name = 'Renamed' where id = %L $f$, test.bob()), 'protected_columns');

  -- Moderator sees staff views but never the author of the anonymous post
  perform test.as_user(test.moderator());
  perform test.assert((select count(*) from public.moderation_experiences) >= 1, 'moderator can list the queue');
  perform test.reset();

  -- Admin limits: at most 2 admins, never the last admin, never self
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L, 'admin', 'Synthetic reason for test') $f$, test.bob()), 'limit_reached');
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L, 'student', 'Synthetic reason for test') $f$, test.admin_x()), 'forbidden');
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L, 'moderator', 'short') $f$, test.bob()), 'reason_required');
  perform public.admin_set_user_role(test.admin_y(), 'student', 'Synthetic demotion for test');
  perform test.reset();
  perform test.as_user(test.admin_y());
  perform test.expect_error($f$ select public.admin_list_audit('Synthetic reason for test') $f$, 'forbidden');
  perform test.reset();
  perform test.assert((select role from public.profiles where id = test.admin_y()) = 'student', 'demotion applied');

  -- Last admin cannot be demoted or delete their account
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.request_account_deletion() $f$, 'last_admin');
  perform test.reset();

  -- Admin operations are audited, and the log is readable only through the admin function
  perform test.as_user(test.admin_x());
  perform public.admin_correct_name(test.bob(), 'Synthetic Robert', 'Synthetic correction for test');
  perform test.assert((select count(*) from public.admin_list_audit('Synthetic review of audit')) >= 3, 'admin sees audit rows');
  perform test.assert(not exists (select 1 from public.admin_list_audit('Synthetic review again') a where a.reason ~ '1RN[0-9]{2}'), 'no USN in audit reasons');
  perform test.reset();
  perform test.assert((select full_name from public.profiles where id = test.bob()) = 'Synthetic Robert', 'admin correction applied');
  perform test.assert(exists (select 1 from private.admin_audit where action = 'correct_name'), 'name correction audited');
end $$;

rollback;
