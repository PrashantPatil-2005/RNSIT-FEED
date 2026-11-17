-- Migration 010: helpful votes, comments, comment reports, pending cancellation, rejected purge.
-- Includes negative tests: every action below is also attempted by a role that must be refused.
begin;

-- ---------- Base tables are unreachable; anon cannot call any write ----------
do $$
declare v_a uuid;
begin
  v_a := test.make_approved(test.alice(), false);

  perform test.as_anon();
  perform test.expect_error($f$ select * from public.comments $f$, 'permission denied');
  perform test.expect_error($f$ select * from public.experience_votes $f$, 'permission denied');
  perform test.expect_error($f$ select * from public.comment_reports $f$, 'permission denied');
  perform test.expect_error(format($f$ select public.set_helpful_vote(%L, true) $f$, v_a), 'permission denied');
  perform test.expect_error(format($f$ select public.add_comment(%L, 'Anonymous visitor comment') $f$, v_a), 'permission denied');
  perform test.expect_error(format($f$ select public.cancel_submission(%L) $f$, v_a), 'permission denied');
  perform test.assert((select count(*) from public.public_engagement where experience_id = v_a) = 1, 'anon reads engagement');
  perform test.reset();

  perform test.as_user(test.bob());
  perform test.expect_error(format($f$ insert into public.comments (experience_id, author_id, body) values (%L, %L, 'Direct insert') $f$, v_a, test.bob()), 'permission denied');
  perform test.expect_error(format($f$ insert into public.experience_votes (experience_id, user_id) values (%L, %L) $f$, v_a, test.bob()), 'permission denied');
  perform test.expect_error($f$ update public.comments set status = 'removed' $f$, 'permission denied');
  perform test.expect_error($f$ delete from public.experience_votes $f$, 'permission denied');
  perform test.reset();
end $$;

-- ---------- Helpful votes ----------
do $$
declare
  v_a uuid;
  v_p uuid;
begin
  v_a := test.make_approved(test.alice(), false);
  v_p := test.make_pending(test.alice(), false);

  perform test.as_user(test.bob());
  perform test.assert(public.set_helpful_vote(v_a, true) = 1, 'first vote counts');
  perform test.assert(public.set_helpful_vote(v_a, true) = 1, 'second vote is idempotent');
  perform test.assert((select count(*) from public.my_votes where experience_id = v_a) = 1, 'my_votes shows the vote');
  perform test.expect_error(format($f$ select public.set_helpful_vote(%L, true) $f$, v_p), 'not_found');
  perform test.expect_error(format($f$ select public.set_helpful_vote(%L, null) $f$, v_a), 'invalid_input');
  perform test.reset();

  perform test.as_user(test.moderator());
  perform test.assert(public.set_helpful_vote(v_a, true) = 2, 'second member counts');
  perform test.reset();

  perform test.as_user(test.alice());
  perform test.expect_error(format($f$ select public.set_helpful_vote(%L, true) $f$, v_a), 'forbidden');
  perform test.assert((select count(*) from public.my_votes) = 0, 'my_votes is per caller');
  perform test.reset();

  perform test.as_anon();
  perform test.assert((select helpful_count from public.public_engagement where experience_id = v_a) = 2, 'public count');
  perform test.assert((select count(*) from public.public_engagement where experience_id = v_p) = 0, 'pending posts have no engagement row');
  perform test.reset();

  perform test.as_user(test.bob());
  perform test.assert(public.set_helpful_vote(v_a, false) = 1, 'unvote');
  perform test.reset();
end $$;

-- ---------- Comments: visibility, validation, anonymity ----------
do $$
declare
  v_named uuid;
  v_anon uuid;
  v_c1 uuid;
  v_c2 uuid;
begin
  v_named := test.make_approved(test.alice(), false);
  v_anon := test.make_approved(test.alice(), true, 'globex-synthetic');

  perform test.as_user(test.bob());
  v_c1 := public.add_comment(v_named, '  Was the OA proctored?  ');
  perform test.expect_error(format($f$ select public.add_comment(%L, 'x') $f$, v_named), 'invalid_input');
  perform test.expect_error(format($f$ select public.add_comment(%L, %L) $f$, v_named, repeat('a', 2001)), 'invalid_input');
  perform test.expect_error(format($f$ select public.add_comment(%L, %L) $f$, v_named, E'\x01\x02'), 'invalid_input');
  perform test.expect_error(format($f$ select public.add_comment(%L, 'On a missing post') $f$, gen_random_uuid()), 'not_found');
  perform test.assert((select body from public.my_comments where id = v_c1) = 'Was the OA proctored?', 'body is trimmed');
  perform test.reset();

  -- The author of an ANONYMOUS post comments on it: no name is shown anywhere public or to staff
  perform test.as_user(test.alice());
  v_c2 := public.add_comment(v_anon, 'Author here: the HR round was short');
  perform test.reset();

  perform test.as_anon();
  perform test.assert((select author_name from public.public_comments where id = v_c1) = 'Synthetic Bob', 'named commenter shown');
  perform test.assert((select author_name from public.public_comments where id = v_c2) is null, 'anonymous post author is not named in comments');
  perform test.assert((select by_post_author from public.public_comments where id = v_c2), 'marked as the post author');
  perform test.assert(not exists (select 1 from public.public_comments x where to_jsonb(x)::text like '%Alice%'), 'no comment row names the anonymous author');
  perform test.assert(not (select is_mine from public.public_comments where id = v_c1), 'is_mine is false for visitors');
  perform test.reset();

  perform test.as_user(test.moderator());
  perform test.assert((select author_name from public.moderation_comments where id = v_c2) is null, 'moderators do not see the anonymous author through comments (U7)');
  perform test.reset();

  perform test.as_user(test.bob());
  perform test.assert((select is_mine from public.public_comments where id = v_c1), 'is_mine for the commenter');
  perform test.assert((select count(*) from public.moderation_comments) = 0, 'students see no staff comment view rows');
  perform test.reset();

  -- No public comment column exposes a time of day or an author id
  perform test.assert(not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'public_comments'
      and (data_type like 'timestamp%' or column_name in ('author_id', 'user_id'))
  ), 'public_comments exposes dates only and no ids of people');

  -- Withdrawal hides comments and engagement from the public
  perform test.as_user(test.alice());
  perform public.withdraw_experience(v_named);
  perform test.reset();
  perform test.as_anon();
  perform test.assert((select count(*) from public.public_comments where experience_id = v_named) = 0, 'withdrawn post comments hidden');
  perform test.assert((select count(*) from public.public_engagement where experience_id = v_named) = 0, 'withdrawn post engagement hidden');
  perform test.reset();
  perform test.as_user(test.bob());
  perform test.expect_error(format($f$ select public.add_comment(%L, 'Commenting after withdrawal') $f$, v_named), 'not_found');
  -- Deleting someone else's comment fails; deleting one's own works
  perform test.expect_error(format($f$ select public.delete_my_comment(%L) $f$, v_c2), 'not_found');
  perform public.delete_my_comment(v_c1);
  perform test.assert((select count(*) from public.my_comments where id = v_c1) = 0, 'own comment deleted');
  perform test.reset();
end $$;

-- ---------- Comment rate limit ----------
do $$
declare
  v_a uuid;
  i integer;
begin
  v_a := test.make_approved(test.alice(), false);
  perform test.as_user(test.bob());
  for i in 1 .. 20 loop
    perform public.add_comment(v_a, 'Synthetic comment number ' || i);
  end loop;
  perform test.expect_error(format($f$ select public.add_comment(%L, 'One too many') $f$, v_a), 'limit_reached');
  perform test.reset();
  -- Clean up (owner session) so later blocks in this transaction are not rate limited.
  delete from public.comments where author_id = test.bob();
end $$;

-- ---------- Comment reports and moderation ----------
do $$
declare
  v_a uuid;
  v_c uuid;
  v_mc uuid;
  v_r uuid;
begin
  v_a := test.make_approved(test.alice(), false);
  perform test.as_user(test.bob());
  v_c := public.add_comment(v_a, 'Call me on my number for answers');
  perform test.expect_error(format($f$ select public.report_comment(%L, 'spam') $f$, v_c), 'forbidden');
  perform test.reset();

  perform test.as_user(test.moderator());
  v_mc := public.add_comment(v_a, 'Moderator own comment here');
  perform test.reset();

  perform test.as_user(test.alice());
  perform public.report_comment(v_c, 'personal_info', 'Shares a phone number');
  perform public.report_comment(v_c, 'personal_info', 'Again');   -- duplicate ignored
  perform test.assert((select count(*) from public.my_comment_reports) = 1, 'one report per user per comment');
  -- Students cannot moderate or resolve
  perform test.expect_error(format($f$ select public.moderate_comment(%L, 'remove', 'personal_info') $f$, v_c), 'forbidden');
  perform test.assert((select count(*) from public.moderation_comment_reports) = 0, 'students see no staff report rows');
  perform test.reset();

  perform test.as_user(test.bob());
  perform test.assert((select count(*) from public.my_comment_reports) = 0, 'reports are private to the reporter');
  perform test.reset();

  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.moderate_comment(%L, 'remove', 'personal_info') $f$, v_mc), 'forbidden');
  perform test.expect_error(format($f$ select public.moderate_comment(%L, 'remove') $f$, v_c), 'reason_required');
  perform test.expect_error(format($f$ select public.moderate_comment(%L, 'explode', 'other') $f$, v_c), 'invalid_input');
  perform test.assert(not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'moderation_comment_reports' and column_name ~ 'reporter'
  ), 'staff report view has no reporter column');
  v_r := (select id from public.moderation_comment_reports where comment_id = v_c);
  perform public.resolve_comment_report(v_r, 'actioned', 'personal_info', true);
  perform test.expect_error(format($f$ select public.resolve_comment_report(%L, 'dismissed') $f$, v_r), 'invalid_state');
  perform test.assert((select status from public.moderation_comments where id = v_c) = 'removed', 'comment removed');
  perform test.assert(exists (select 1 from public.moderation_history where action = 'remove_comment'), 'removal logged');
  perform test.assert(exists (select 1 from public.moderation_history where action = 'resolve_comment_report'), 'resolution logged');
  perform test.reset();

  perform test.as_anon();
  perform test.assert((select count(*) from public.public_comments where id = v_c) = 0, 'removed comment hidden');
  perform test.assert((select comment_count from public.public_engagement where experience_id = v_a) = 1, 'count excludes removed');
  perform test.reset();

  perform test.as_user(test.bob());
  perform test.assert((select status from public.my_comments where id = v_c) = 'removed', 'commenter sees the removal');
  perform test.expect_error(format($f$ select public.report_comment(%L, 'spam') $f$, v_c), 'not_found');
  perform test.reset();

  -- The post author's feedback does not list actions on other people's comments
  perform test.as_user(test.alice());
  perform test.assert(not exists (select 1 from public.my_moderation_feedback where action::text like '%comment%'), 'author feedback excludes comment actions');
  perform test.reset();

  -- Restore
  perform test.as_user(test.moderator());
  perform public.moderate_comment(v_c, 'restore');
  perform test.expect_error(format($f$ select public.moderate_comment(%L, 'restore') $f$, v_c), 'invalid_state');
  perform test.reset();

  -- The log stays append-only, including the new columns
  perform test.expect_error($f$ update public.moderation_actions set comment_id = gen_random_uuid() where comment_id is not null $f$, 'audit_immutable');
  perform test.expect_error($f$ delete from public.moderation_actions where comment_id is not null $f$, 'audit_immutable');
end $$;

-- ---------- Pending cancellation (O-4) ----------
do $$
declare
  v_p uuid;
  v_a uuid;
begin
  v_p := test.make_pending(test.alice(), true);
  v_a := test.make_approved(test.alice(), false);

  perform test.as_user(test.bob());
  perform test.expect_error(format($f$ select public.cancel_submission(%L) $f$, v_p), 'not_found');
  perform test.reset();

  perform test.as_user(test.alice());
  perform test.expect_error(format($f$ select public.cancel_submission(%L) $f$, v_a), 'invalid_state');
  perform public.cancel_submission(v_p);
  perform test.assert((select status from public.my_experiences where id = v_p) = 'draft', 'pending -> draft');
  perform test.assert((select submitted_at from public.my_experiences where id = v_p) is null, 'submission time cleared');
  perform test.expect_error(format($f$ select public.cancel_submission(%L) $f$, v_p), 'invalid_state');
  perform public.submit_experience(v_p);
  perform test.assert((select status from public.my_experiences where id = v_p) = 'pending', 'can resubmit after cancelling');
  perform test.reset();

  perform test.as_user(test.moderator());
  perform test.assert(exists (select 1 from public.moderation_history where action = 'cancel_submission' and experience_id = v_p), 'cancellation logged');
  perform test.assert((select actor_role from public.moderation_history where action = 'cancel_submission' and experience_id = v_p) = 'author', 'logged as author, no identity');
  perform test.reset();
  perform test.assert((select actor_id from public.moderation_actions where action = 'cancel_submission' and experience_id = v_p) is null, 'no actor id stored for author events');

  -- Status still cannot be changed directly
  perform test.expect_error(format($f$ update public.experiences set status = 'draft' where id = %L $f$, v_a), 'status_change_forbidden');
end $$;

-- ---------- Rejected-post purge (O-4) ----------
do $$
declare
  v_old uuid;
  v_new uuid;
  v_draft uuid;
  v_n integer;
begin
  v_old := test.make_pending(test.alice(), false);
  v_new := test.make_pending(test.bob(), false);
  perform test.as_user(test.moderator());
  perform public.moderate_experience(v_old, 'reject', 'low_quality', 'Synthetic note');
  perform public.moderate_experience(v_new, 'reject', 'low_quality', 'Synthetic note');
  perform test.reset();
  perform test.assert((select rejected_at from public.experiences where id = v_old) is not null, 'rejection time recorded');

  -- Backdate one rejection (owner session; content and status unchanged, so the guard allows it)
  update public.experiences set rejected_at = now() - interval '91 days', updated_at = now() - interval '91 days' where id = v_old;

  perform test.as_user(test.alice());
  perform test.expect_error($f$ select public.purge_rejected_experiences(90) $f$, 'permission denied');
  perform test.reset();
  perform test.as_anon();
  perform test.expect_error($f$ select public.purge_rejected_experiences(90) $f$, 'permission denied');
  perform test.reset();

  perform test.as_service();
  perform test.expect_error($f$ select public.purge_rejected_experiences(0) $f$, 'invalid_input');
  v_n := public.purge_rejected_experiences(90);
  perform test.reset();
  perform test.assert(v_n = 1, 'exactly one old rejected post purged');
  perform test.assert(not exists (select 1 from public.experiences where id = v_old), 'old rejected post gone');
  perform test.assert(exists (select 1 from public.experiences where id = v_new), 'recent rejected post kept');
  perform test.assert(not exists (select 1 from private.experience_authors where experience_id = v_old), 'author mapping gone');
  perform test.assert(exists (select 1 from public.moderation_actions where action = 'reject' and experience_id is null), 'audit rows kept without the post id');
end $$;

-- ---------- Account deletion removes votes and comments (U5) ----------
do $$
declare
  v_a uuid;
  v_c uuid;
  v_alice_c uuid;
begin
  v_a := test.make_approved(test.alice(), false);
  perform test.as_user(test.bob());
  perform public.set_helpful_vote(v_a, true);
  v_c := public.add_comment(v_a, 'Bob comment to be deleted');
  perform test.reset();
  perform test.as_user(test.alice());
  v_alice_c := public.add_comment(v_a, 'Alice reply comment');
  perform test.reset();
  perform test.as_user(test.bob());
  perform public.report_comment(v_alice_c, 'other', 'Synthetic free text from Bob');
  perform test.reset();
  perform test.as_user(test.moderator());
  perform public.moderate_comment(v_c, 'remove', 'other');
  perform test.reset();

  perform test.as_user(test.bob());
  perform public.request_account_deletion();
  -- Writes are refused once deletion is requested
  perform test.expect_error(format($f$ select public.add_comment(%L, 'After deletion request') $f$, v_a), 'forbidden');
  perform test.expect_error(format($f$ select public.set_helpful_vote(%L, false) $f$, v_a), 'forbidden');
  perform test.reset();

  perform test.as_service();
  perform public.delete_account_data(test.bob());
  perform test.reset();

  perform test.assert(not exists (select 1 from public.comments where author_id = test.bob()), 'comments deleted');
  perform test.assert(not exists (select 1 from public.experience_votes where user_id = test.bob()), 'votes deleted');
  perform test.assert(not exists (select 1 from public.comment_reports where details like '%Bob%'), 'report free text cleared');
  perform test.assert(exists (select 1 from public.comment_reports where comment_id = v_alice_c and reporter_id is null), 'report kept without reporter');
  perform test.assert(exists (select 1 from public.moderation_actions where action = 'remove_comment' and comment_id is null), 'audit kept without the comment id');
end $$;

rollback;
