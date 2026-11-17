-- Moderation, withdrawal, public visibility and status transitions.
begin;

do $$
declare
  v_pending uuid;
  v_rejected uuid;
  v_live uuid;
  v_actions int;
begin
  v_pending := test.make_pending(test.alice(), false, 'acme-synthetic');

  -- Pending posts are never public, searchable or counted
  perform test.as_anon();
  perform test.assert((select count(*) from public.public_experiences) = 0, 'pending is not public');
  perform test.assert((select count(*) from public.public_rounds) = 0, 'pending rounds are not public');
  perform test.assert((select count(*) from public.public_questions) = 0, 'pending questions are not public');
  perform test.assert((select count(*) from public.public_resources) = 0, 'pending resources are not public');
  perform test.assert((select count(*) from public.company_stats) = 0, 'pending posts do not count in company stats');
  perform test.assert((select count(*) from public.search_experiences('hash')) = 0, 'pending is not searchable');
  perform test.reset();

  -- An author cannot approve, reject or remove their own post, or change status directly
  perform test.as_user(test.alice());
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve') $f$, v_pending), 'forbidden');
  perform test.expect_error(format($f$ update public.experiences set status = 'approved' where id = %L $f$, v_pending), 'permission denied');
  perform test.reset();

  -- A student who is not staff cannot moderate either
  perform test.as_user(test.bob());
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve') $f$, v_pending), 'forbidden');
  perform test.assert((select count(*) from public.moderation_experiences) = 0, 'a non-staff student sees nothing in the moderation queue');
  perform test.assert((select count(*) from public.moderation_reports) = 0, 'a non-staff student sees no reports');
  perform test.reset();

  -- Requesting changes needs a reason and a note (SC-2); returned is not public; the author sees
  -- the note and history
  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'return') $f$, v_pending), 'reason_required');
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'return', 'low_quality') $f$, v_pending), 'note_required');
  perform public.moderate_experience(v_pending, 'return', 'low_quality', 'Please add more detail to the rounds.');
  perform test.reset();
  v_rejected := v_pending;

  perform test.as_anon();
  perform test.assert((select count(*) from public.public_experiences) = 0, 'rejected is not public');
  perform test.assert((select count(*) from public.company_stats) = 0, 'rejected does not count in stats');
  perform test.reset();

  perform test.as_user(test.alice());
  perform test.assert((select status from public.my_experiences where id = v_rejected) = 'returned', 'status is returned');
  perform test.assert((select moderation_note from public.my_experiences where id = v_rejected) = 'Please add more detail to the rounds.', 'author can read the note');
  perform test.assert((select count(*) from public.my_moderation_feedback where experience_id = v_rejected and action = 'return') = 1, 'author sees the history');
  -- Returned posts can be corrected and resubmitted
  perform public.save_draft(v_rejected, (select row_version from public.my_experiences where id = v_rejected), '{"prep_tips":"More detail added"}'::jsonb);
  perform public.submit_experience(v_rejected);
  perform test.reset();
  perform test.assert((select status from public.experiences where id = v_rejected) = 'pending', 'resubmitted post is pending again');

  -- Approve: now public and counted
  perform test.as_user(test.moderator());
  perform public.moderate_experience(v_rejected, 'approve');
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve') $f$, v_rejected), 'invalid_state');
  perform test.reset();
  v_live := v_rejected;

  perform test.as_anon();
  perform test.assert((select count(*) from public.public_experiences) = 1, 'approved is public');
  perform test.assert((select post_count from public.company_stats where slug = 'acme-synthetic') = 1, 'approved counts in stats');
  perform test.assert((select count(*) from public.search_experiences('hash')) = 1, 'approved is searchable');
  perform test.reset();

  -- Approved content is locked for everyone (interim default for U6), even for the table owner
  perform test.expect_error(format($f$ update public.experiences set role_title = 'Silent Edit' where id = %L $f$, v_live), 'content_locked');
  perform test.expect_error(format($f$ delete from public.rounds where experience_id = %L $f$, v_live), 'content_locked');
  perform test.as_user(test.alice());
  perform test.expect_error(format($f$ select public.save_draft(%L, 99, '{"role_title":"x"}'::jsonb) $f$, v_live), 'invalid_state');
  perform test.reset();

  -- Illegal transitions are refused even for the owner role (guard trigger, no function flag)
  perform test.expect_error(format($f$ update public.experiences set status = 'draft' where id = %L $f$, v_live), 'status_change_forbidden');

  -- Withdrawal (U12): only the author, only approved; removes from every public surface; keeps history
  perform test.as_user(test.bob());
  perform test.expect_error(format($f$ select public.withdraw_experience(%L) $f$, v_live), 'not_found');
  perform test.reset();
  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.withdraw_experience(%L) $f$, v_live), 'not_found');
  perform test.reset();

  select count(*) into v_actions from public.moderation_actions where experience_id = v_live;

  perform test.as_user(test.alice());
  perform public.withdraw_experience(v_live);
  perform test.expect_error(format($f$ select public.withdraw_experience(%L) $f$, v_live), 'invalid_state');
  perform test.assert((select status from public.my_experiences where id = v_live) = 'withdrawn', 'author sees the withdrawn status');
  perform test.reset();

  perform test.as_anon();
  perform test.assert((select count(*) from public.public_experiences) = 0, 'withdrawn is not public');
  perform test.assert((select count(*) from public.public_rounds) = 0, 'withdrawn rounds are not public');
  perform test.assert((select count(*) from public.public_questions) = 0, 'withdrawn questions are not public');
  perform test.assert((select count(*) from public.company_stats) = 0, 'withdrawn does not count in aggregates');
  perform test.assert((select count(*) from public.search_experiences('hash')) = 0, 'withdrawn is not searchable');
  perform test.reset();

  perform test.assert((select count(*) from public.moderation_actions where experience_id = v_live) = v_actions + 1, 'history kept and extended by the withdrawal');
  perform test.assert((select count(*) from public.moderation_actions where experience_id = v_live and action = 'approve') = 1, 'earlier moderation actions are preserved');
  perform test.assert((select actor_id from public.moderation_actions where action = 'withdraw' and experience_id = v_live) is null, 'withdrawal does not record the author id');

  -- Withdrawn is terminal: no one can bring it back
  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'restore') $f$, v_live), 'invalid_state');
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve') $f$, v_live), 'invalid_state');
  perform test.reset();
  perform test.expect_error(format($f$ update public.experiences set status = 'approved' where id = %L $f$, v_live), 'status_change_forbidden');
end $$;

-- Remove and restore, and moderators cannot moderate their own posts
do $$
declare v_id uuid; v_mod_post uuid;
begin
  v_id := test.make_approved(test.alice(), false);
  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'remove') $f$, v_id), 'reason_required');
  perform public.moderate_experience(v_id, 'remove', 'personal_info', 'Contains a personal detail.');
  perform test.reset();
  perform test.as_anon();
  perform test.assert((select count(*) from public.public_experiences) = 0, 'removed is not public');
  perform test.reset();
  perform test.as_user(test.moderator());
  perform public.moderate_experience(v_id, 'restore');
  perform test.reset();
  perform test.as_anon();
  perform test.assert((select count(*) from public.public_experiences) = 1, 'restored is public again');
  perform test.reset();

  v_mod_post := test.make_pending(test.moderator(), false, 'globex-synthetic');
  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve') $f$, v_mod_post), 'forbidden');
  perform test.reset();
  perform test.as_user(test.admin_x());
  perform public.moderate_experience(v_mod_post, 'approve');
  perform test.reset();
end $$;

rollback;
