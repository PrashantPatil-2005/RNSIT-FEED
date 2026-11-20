-- Post, comment and user management (migration 030).
begin;

-- Only admins
do $$
declare
  v_uid uuid;
  v_post uuid := test.make_approved(test.alice(), false);
begin
  foreach v_uid in array array[test.bob(), test.moderator()] loop
    perform test.as_user(v_uid);
    perform test.expect_error(format($f$ select public.admin_set_suspended(%L::uuid, true, 'Synthetic user action') $f$, test.alice()), 'forbidden');
    perform test.expect_error(format($f$ select public.admin_request_user_deletion(%L::uuid, 'Synthetic user action') $f$, test.alice()), 'forbidden');
    perform test.expect_error(format($f$ select public.admin_set_user_details(%L::uuid, 1::smallint, 1::smallint, 'Synthetic user action') $f$, test.alice()), 'forbidden');
    perform test.expect_error(format($f$ select public.admin_remove_user_comments(%L::uuid, 'other', 'Synthetic user action') $f$, test.alice()), 'forbidden');
    perform test.expect_error(format($f$ select public.admin_edit_post(%L::uuid, 'prep_tips', null, 'x', 'Synthetic post fix') $f$, v_post), 'forbidden');
    perform test.expect_error(format($f$ select public.admin_delete_post(%L::uuid, 'Synthetic post delete') $f$, v_post), 'forbidden');
    perform test.expect_error(format($f$ update public.profiles set suspended_at = now() where id = %L $f$, v_uid), 'permission denied');
    perform test.reset();
  end loop;
  perform test.as_anon();
  perform test.expect_error(format($f$ select public.admin_delete_post(%L::uuid, 'Synthetic post delete') $f$, v_post), 'permission denied');
  perform test.reset();
end $$;

-- Suspension blocks every action but keeps posts; unsuspend restores
do $$
declare
  v_post uuid := test.make_approved(test.bob(), false);
  v_audit integer := (select count(*) from private.admin_audit where action = 'manage_user');
begin
  perform test.as_user(test.admin_x());
  perform public.admin_set_suspended(test.alice(), true, 'Synthetic spam suspension');
  perform test.expect_error(format($f$ select public.admin_set_suspended(%L::uuid, true, 'Synthetic spam suspension') $f$, test.alice()), 'invalid_state');
  perform test.reset();

  perform test.as_user(test.alice());
  perform test.expect_error(format($f$ select public.add_comment(%L::uuid, 'Synthetic comment text') $f$, v_post), 'suspended');
  perform test.expect_error(format($f$ select public.set_helpful_vote(%L::uuid, true) $f$, v_post), 'suspended');
  perform test.expect_error($f$ select public.save_draft(null, null, '{}'::jsonb) $f$, 'suspended');
  perform test.reset();
  perform test.assert((select status from public.experiences where id = v_post) = 'approved', 'posts stay published');

  -- A suspended moderator loses staff powers
  perform test.as_user(test.admin_x());
  perform public.admin_set_suspended(test.moderator(), true, 'Synthetic moderator suspension');
  perform test.reset();
  perform test.as_user(test.moderator());
  perform test.assert(not private.is_staff(), 'suspended moderator is not staff');
  perform test.reset();

  perform test.as_user(test.admin_x());
  perform public.admin_set_suspended(test.alice(), false, 'Synthetic suspension lifted');
  perform public.admin_set_suspended(test.moderator(), false, 'Synthetic suspension lifted');
  perform test.reset();
  perform test.as_user(test.alice());
  perform public.add_comment(v_post, 'Synthetic comment after unsuspend');
  perform test.reset();
  perform test.assert((select count(*) from private.admin_audit where action = 'manage_user') = v_audit + 4, 'suspensions audited');
end $$;

-- Admins, the owner and yourself are protected
do $$
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_set_suspended(%L::uuid, true, 'Synthetic user action') $f$, test.admin_y()), 'is_admin');
  perform test.expect_error(format($f$ select public.admin_request_user_deletion(%L::uuid, 'Synthetic user action') $f$, test.admin_y()), 'is_admin');
  perform test.expect_error(format($f$ select public.admin_set_suspended(%L::uuid, true, 'Synthetic user action') $f$, test.admin_x()), 'forbidden');
  perform test.reset();
  insert into private.settings (key, value) values ('owner_email', 'synthetic.alice@example.test');
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_set_suspended(%L::uuid, true, 'Synthetic user action') $f$, test.alice()), 'owner_protected');
  perform test.expect_error(format($f$ select public.admin_set_user_details(%L::uuid, 1::smallint, 1::smallint, 'Synthetic user action') $f$, test.alice()), 'owner_protected');
  perform test.reset();
  delete from private.settings where key = 'owner_email';
end $$;

-- Details fix and forced deletion
do $$
declare v_batch smallint := (select id from public.batches where grad_year = 2027);
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_set_user_details(%L::uuid, 32000::smallint, %s::smallint, 'Synthetic user action') $f$, test.bob(), v_batch), 'invalid_input');
  perform public.admin_set_user_details(test.bob(), 3::smallint, v_batch, 'Synthetic branch correction');
  perform public.admin_request_user_deletion(test.claimant(), 'Synthetic forced deletion');
  perform test.expect_error(format($f$ select public.admin_request_user_deletion(%L::uuid, 'Synthetic forced deletion') $f$, test.claimant()), 'invalid_state');
  perform test.reset();
  perform test.assert((select department_id = 3 and batch_id = v_batch from public.profiles where id = test.bob()), 'department and batch fixed');
  perform test.assert((select deletion_requested_at is not null from public.profiles where id = test.claimant()), 'account marked for deletion');
  perform public.delete_account_data(test.claimant());
  perform test.assert(not exists (select 1 from public.profiles where id = test.claimant()), 'maintenance path deletes it');
end $$;

-- Remove all comments by one member
do $$
declare
  v_post uuid := test.make_approved(test.alice(), false);
  v_n integer;
begin
  perform test.as_user(test.bob());
  perform public.add_comment(v_post, 'Synthetic comment one');
  perform public.add_comment(v_post, 'Synthetic comment two');
  perform test.reset();
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_remove_user_comments(%L::uuid, null, 'Synthetic cleanup') $f$, test.bob()), 'reason_required');
  v_n := public.admin_remove_user_comments(test.bob(), 'low_quality', 'Synthetic spam cleanup');
  perform test.reset();
  perform test.assert(v_n >= 2, 'comments removed');
  perform test.assert(not exists (select 1 from public.comments where author_id = test.bob() and status = 'visible'), 'none left visible');
end $$;

-- Admin text fixes on a published post; other content stays locked
do $$
declare
  v_post uuid := test.make_approved(test.alice(), false);
  v_round uuid := (select id from public.rounds where experience_id = v_post limit 1);
  v_q uuid := (select q.id from public.questions q join public.rounds r on r.id = q.round_id where r.experience_id = v_post limit 1);
  v_res uuid := (select id from public.experience_resources where experience_id = v_post limit 1);
  v_other uuid := test.make_approved(test.bob(), false);
begin
  perform test.as_user(test.admin_x());
  perform public.admin_edit_post(v_post, 'prep_tips', null, 'Practise daily (contact removed)', 'Synthetic personal detail removed');
  perform public.admin_edit_post(v_post, 'role_title', null, 'SDE Intern', 'Synthetic typo fix');
  perform public.admin_edit_post(v_post, 'round_notes', v_round, 'Notes without names', 'Synthetic interviewer name removed');
  perform public.admin_edit_post(v_post, 'question', v_q, 'Explain how hashing handles collisions', 'Synthetic NDA wording fix');
  perform public.admin_edit_post(v_post, 'remove_resource', v_res, null, 'Synthetic broken link removed');
  perform test.expect_error(format($f$ select public.admin_edit_post(%L::uuid, 'question', %L::uuid, 'short', 'Synthetic NDA wording fix') $f$, v_post, v_q), 'invalid_input');
  perform test.expect_error(format($f$ select public.admin_edit_post(%L::uuid, 'result', null, 'rejected', 'Synthetic bad field') $f$, v_post), 'invalid_input');
  perform test.expect_error(format($f$ select public.admin_edit_post(%L::uuid, 'question', %L::uuid, 'A valid question body here', 'Synthetic wrong post') $f$, v_other, v_q), 'not_found');
  perform test.reset();
  perform test.assert((select prep_tips from public.experiences where id = v_post) = 'Practise daily (contact removed)', 'tips fixed');
  perform test.as_user(test.admin_x());
  perform test.assert(public.admin_post_detail(v_post) ->> 'prep_tips' = 'Practise daily (contact removed)', 'admin detail shows the fix');
  perform test.assert(jsonb_array_length(public.admin_post_detail(v_post) -> 'rounds') >= 1, 'admin detail lists rounds with ids');
  perform test.assert(not (public.admin_post_detail(v_post) ? 'author_id'), 'admin detail has no author identity');
  perform test.reset();
  perform test.as_user(test.moderator());
  perform test.expect_error(format($f$ select public.admin_post_detail(%L::uuid) $f$, v_post), 'forbidden');
  perform test.reset();
  perform test.assert((select role_title from public.experiences where id = v_post) = 'SDE Intern', 'title fixed');
  perform test.assert((select status from public.experiences where id = v_post) = 'approved', 'still published');
  perform test.assert((select body from public.questions where id = v_q) = 'Explain how hashing handles collisions', 'question fixed');
  perform test.assert(not exists (select 1 from public.experience_resources where id = v_res), 'link removed');
  perform test.assert(current_setting('app.admin_edit', true) is distinct from '1', 'edit flag cleared');
  -- Outside an admin fix the post is still locked
  perform test.expect_error(format($f$ update public.experiences set prep_tips = 'x' where id = %L $f$, v_post), 'content_locked');
  perform test.expect_error(format($f$ update public.questions set body = 'Another body text here' where id = %L $f$, v_q), 'content_locked');
  perform test.assert((select count(*) from private.admin_audit where action = 'edit_post' and experience_id = v_post) = 5, 'each fix audited');
end $$;

-- Hard delete
do $$
declare v_post uuid := test.make_approved(test.alice(), false);
begin
  perform test.as_user(test.bob());
  perform public.add_comment(v_post, 'Synthetic comment to go');
  perform test.reset();
  perform test.as_user(test.admin_x());
  perform public.admin_delete_post(v_post, 'Synthetic NDA breach, removed fully');
  perform test.expect_error(format($f$ select public.admin_delete_post(%L::uuid, 'Synthetic NDA breach, removed fully') $f$, v_post), 'not_found');
  perform test.reset();
  perform test.assert(not exists (select 1 from public.experiences where id = v_post), 'post deleted');
  perform test.assert(not exists (select 1 from public.comments where experience_id = v_post), 'its comments went too');
  perform test.assert(exists (select 1 from private.admin_audit where action = 'delete_post' and evidence_ref = 'experience:' || v_post), 'deletion audited with the id');
end $$;

rollback;
