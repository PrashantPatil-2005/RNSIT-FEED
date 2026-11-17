-- Phase 3: moderation workflow, concurrency, privacy and authorization (negative tests included).
begin;

do $$
declare
  v_ret uuid;
  v_rej uuid;
  v_app uuid;
  v_anon uuid;
  v_ver integer;
  v_json jsonb;
begin
  v_ret := test.make_pending(test.alice(), false);
  v_rej := test.make_pending(test.alice(), true, 'globex-synthetic');
  v_app := test.make_pending(test.bob(), false);
  v_anon := test.make_pending(test.bob(), true, 'globex-synthetic');

  -- ---------- Who can moderate ----------
  perform test.as_anon();
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve') $f$, v_app), 'permission denied');
  perform test.expect_error(format($f$ select public.moderation_experience_detail(%L) $f$, v_app), 'permission denied');
  perform test.expect_error($f$ select * from public.moderation_experiences $f$, 'permission denied');
  perform test.expect_error($f$ select * from public.moderation_history $f$, 'permission denied');
  perform test.reset();

  perform test.as_user(test.alice());   -- a student, and the author of two of these posts
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve') $f$, v_app), 'forbidden');
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve') $f$, v_ret), 'forbidden');
  perform test.expect_error(format($f$ select public.moderation_experience_detail(%L) $f$, v_app), 'forbidden');
  perform test.assert((select count(*) from public.moderation_experiences) = 0, 'students see an empty queue');
  perform test.assert((select count(*) from public.moderation_history) = 0, 'students see no history');
  perform test.expect_error(format($f$ update public.experiences set status = 'approved' where id = %L $f$, v_ret), 'permission denied');
  perform test.reset();

  -- ---------- Review data and anonymity ----------
  perform test.as_user(test.moderator());
  perform test.assert((select count(*) from public.moderation_experiences where status = 'pending') >= 4, 'moderator sees the pending queue');
  perform test.assert((select author_name from public.moderation_experiences where id = v_app) = 'Synthetic Bob', 'named author visible to staff');
  perform test.assert((select author_name from public.moderation_experiences where id = v_anon) is null, 'anonymous author hidden in queue (U7)');
  v_json := public.moderation_experience_detail(v_anon);
  perform test.assert(v_json ->> 'author_name' is null, 'anonymous author hidden in detail');
  perform test.assert(not (v_json::text ~* 'Synthetic Bob|1RN00ZZ|synthetic\.bob@'), 'detail JSON carries no name, USN or email of the anonymous author');
  perform test.assert(not (v_json ? 'author_id'), 'no author id key');
  perform test.assert(not exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'moderation_experiences'
      and column_name in ('author_id', 'email', 'usn')), 'queue view has no identity columns');
  -- Moderators cannot reach identity data or change authorship
  perform test.expect_error($f$ select * from private.experience_authors $f$, 'permission denied');
  perform test.expect_error($f$ select * from private.profile_private $f$, 'permission denied');
  perform test.expect_error(format($f$ select public.admin_reveal_author(%L, 'moderator curiosity check') $f$, v_anon), 'forbidden');
  perform test.expect_error(format($f$ select public.admin_get_usn(%L, 'moderator curiosity check') $f$, test.bob()), 'forbidden');
  perform test.expect_error(format($f$ update public.experiences set is_anonymous = false where id = %L $f$, v_anon), 'permission denied');
  perform test.expect_error(format($f$ select public.save_draft(%L, 1, '{"role_title":"Edited by moderator"}') $f$, v_anon), 'not_found');

  -- ---------- Request changes (return) ----------
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'return', 'low_quality', '   ') $f$, v_ret), 'note_required');
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'return', 'low_quality', 'too short') $f$, v_ret), 'note_required');
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'return', null, 'A long enough note here') $f$, v_ret), 'reason_required');
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'explode') $f$, v_ret), 'invalid_input');
  v_ver := (select row_version from public.moderation_experiences where id = v_ret);
  perform public.moderate_experience(v_ret, 'return', 'low_quality', 'Please describe the technical round in more detail.', v_ver);
  perform test.reset();

  -- ---------- Reject (final) and approve ----------
  perform test.as_user(test.moderator());
  perform public.moderate_experience(v_rej, 'reject', 'nda', 'The questions are copied from a confidential test paper.');
  perform public.moderate_experience(v_app, 'approve', null, null, (select row_version from public.moderation_experiences where id = v_app));
  -- Concurrency: a second decision on an already decided post fails
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'reject', 'other', 'Conflicting late decision') $f$, v_app), 'invalid_state');
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve') $f$, v_rej), 'invalid_state');
  perform test.assert((select count(*) from public.moderation_history where experience_id = v_app and action = 'approve') = 1, 'one decision recorded');
  perform test.reset();

  -- ---------- Visibility per status ----------
  perform test.as_anon();
  perform test.assert(exists (select 1 from public.public_experiences where id = v_app), 'approved is public');
  perform test.assert(not exists (select 1 from public.public_experiences where id in (v_ret, v_rej, v_anon)), 'returned, rejected and pending stay private');
  perform test.reset();

  -- ---------- Author view ----------
  perform test.as_user(test.alice());
  perform test.assert((select status from public.my_experiences where id = v_ret) = 'returned', 'returned');
  perform test.assert((select status from public.my_experiences where id = v_rej) = 'rejected', 'rejected');
  perform test.assert((select moderation_note from public.my_experiences where id = v_rej) like 'The questions are copied%', 'author sees the rejection reason');
  perform test.assert((select reason_code from public.my_moderation_feedback where experience_id = v_rej and action = 'reject') = 'nda', 'author sees the reason code');
  perform test.assert(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'my_moderation_feedback' and column_name ~ 'actor'), 'author does not learn which moderator decided');
  -- Returned: editable and resubmittable
  v_ver := (select row_version from public.my_experiences where id = v_ret);
  perform public.save_draft(v_ret, v_ver, '{"prep_tips":"Added the requested detail"}');
  perform public.submit_experience(v_ret);
  perform test.assert((select status from public.my_experiences where id = v_ret) = 'pending', 'returned post resubmitted');
  perform test.assert((select moderation_note from public.my_experiences where id = v_ret) is null, 'resubmission clears the old note');
  -- Rejected: final
  v_ver := (select row_version from public.my_experiences where id = v_rej);
  perform test.expect_error(format($f$ select public.save_draft(%L, %s, '{"prep_tips":"Trying to edit"}') $f$, v_rej, v_ver), 'invalid_state');
  perform test.expect_error(format($f$ select public.submit_experience(%L) $f$, v_rej), 'invalid_state');
  perform test.expect_error(format($f$ select public.cancel_submission(%L) $f$, v_rej), 'invalid_state');
  perform public.delete_draft(v_rej);
  perform test.assert(not exists (select 1 from public.my_experiences where id = v_rej), 'author can delete a rejected post');
  perform test.reset();
  perform test.assert(exists (select 1 from public.moderation_actions where action = 'reject' and experience_id is null and reason_code = 'nda'), 'audit row kept without the post id after deletion');

  -- ---------- Stale review: the author changed the post after the moderator opened it ----------
  perform test.as_user(test.moderator());
  v_ver := (select row_version from public.moderation_experiences where id = v_ret);   -- moderator opens it
  perform test.reset();
  perform test.as_user(test.alice());
  perform public.cancel_submission(v_ret);
  perform public.save_draft(v_ret, (select row_version from public.my_experiences where id = v_ret), '{"prep_tips":"Changed after the moderator looked"}');
  perform public.submit_experience(v_ret);
  perform test.reset();
  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve', null, null, %s) $f$, v_ret, v_ver), 'version_conflict');
  perform test.assert((select status from public.moderation_experiences where id = v_ret) = 'pending', 'stale approval changed nothing');
  perform public.moderate_experience(v_ret, 'approve', null, null, (select row_version from public.moderation_experiences where id = v_ret));
  perform test.reset();

  -- ---------- History and audit ----------
  perform test.as_user(test.moderator());
  perform test.assert((select actor_name from public.moderation_history where experience_id = v_app and action = 'approve') = 'Synthetic Moderator', 'history names the deciding staff member');
  perform test.assert(not exists (select 1 from public.moderation_history where actor_role = 'author' and actor_name is not null), 'author events never carry a name');
  perform test.assert((select count(*) from public.moderation_history where experience_id = v_ret) >= 6, 'full trail: submit, return, resubmit, cancel, submit, approve');
  perform test.reset();
  perform test.expect_error($f$ update public.moderation_actions set reason_code = 'other' where action = 'return' $f$, 'audit_immutable');
  perform test.expect_error($f$ delete from public.moderation_actions where action = 'approve' $f$, 'audit_immutable');
  perform test.assert(not exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'moderation_actions'
      and data_type in ('text', 'character varying') and column_name <> 'actor_role'), 'moderation notes are not copied into the audit log');

  -- A moderator who wrote a post cannot moderate it
  perform test.as_user(test.moderator());
  perform test.reset();
  v_json := to_jsonb(test.make_pending(test.moderator(), false, 'globex-synthetic'));
  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.moderate_experience(%L, 'approve') $f$, (v_json #>> '{}')::uuid), 'forbidden');
  perform test.assert((public.moderation_experience_detail((v_json #>> '{}')::uuid) ->> 'is_own')::boolean, 'detail flags the moderator''s own post');
  perform test.reset();

  -- Admins moderate too (same rules)
  perform test.as_user(test.admin_x());
  perform public.moderate_experience(v_anon, 'return', 'other', 'Admin requesting a clarification here.');
  perform test.reset();
end $$;

rollback;
