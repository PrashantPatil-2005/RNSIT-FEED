-- Account deletion (decision U5): experiences and personal data are destroyed; audit history keeps
-- only action, role and time. Withdrawal is different: it keeps the post and its history.
begin;

do $$
declare
  v_live uuid;
  v_pending uuid;
  v_draft uuid;
  v_other uuid;
  v_report_on_other uuid;
  v_n int;
begin
  v_live := test.make_approved(test.alice(), true, 'acme-synthetic');
  v_pending := test.make_pending(test.alice(), false, 'globex-synthetic');
  v_other := test.make_approved(test.bob(), false, 'globex-synthetic');

  perform test.as_user(test.alice());
  v_draft := (public.save_draft(null, null, '{"role_title":"Alice Draft Synthetic"}'::jsonb) ->> 'id')::uuid;
  perform public.report_experience(v_other, 'spam', 'Synthetic report details from Alice');
  perform test.reset();

  perform test.as_user(test.bob());
  perform public.report_experience(v_live, 'fake', 'Synthetic report on Alice post');
  perform test.reset();
  select r.id into v_report_on_other from public.reports r where r.experience_id = v_other;

  -- Only the service role may finish a deletion, and only after the user requested it
  perform test.as_user(test.alice());
  perform test.expect_error(format($f$ select public.delete_account_data(%L) $f$, test.alice()), 'permission denied');
  perform public.request_account_deletion();
  -- After requesting, the account can do nothing
  perform test.expect_error($f$ select public.save_draft(null, null, '{}'::jsonb) $f$, 'forbidden');
  perform test.expect_error($f$ select public.get_my_usn() $f$, 'forbidden');
  perform test.reset();
  perform test.as_service();
  perform test.expect_error(format($f$ select public.delete_account_data(%L) $f$, test.bob()), 'deletion_not_requested');
  perform test.reset();

  select count(*) into v_n from public.moderation_actions where experience_id = v_live;
  perform test.assert(v_n >= 2, 'precondition: the post has audit history');

  perform test.as_service();
  perform public.delete_account_data(test.alice());
  perform test.reset();

  -- Everything of the user's is gone
  perform test.assert(not exists (select 1 from public.profiles where id = test.alice()), 'profile deleted');
  perform test.assert(not exists (select 1 from private.profile_private where user_id = test.alice()), 'USN deleted');
  perform test.assert(not exists (select 1 from private.experience_authors where author_id = test.alice()), 'author mapping deleted');
  perform test.assert(not exists (select 1 from public.experiences where id in (v_live, v_pending, v_draft)), 'all experiences (approved, pending, draft) deleted');
  perform test.assert((select count(*) from public.rounds r where not exists (select 1 from public.experiences e where e.id = r.experience_id)) = 0, 'no orphan rounds');
  perform test.assert((select count(*) from public.questions q where not exists (select 1 from public.rounds r where r.id = q.round_id)) = 0, 'no orphan questions');
  perform test.assert((select count(*) from public.round_topics rt where not exists (select 1 from public.rounds r where r.id = rt.round_id)) = 0, 'no orphan round topics');
  perform test.assert((select count(*) from public.question_topics qt where not exists (select 1 from public.questions q where q.id = qt.question_id)) = 0, 'no orphan question topics');
  perform test.assert((select count(*) from public.experience_resources x where not exists (select 1 from public.experiences e where e.id = x.experience_id)) = 0, 'no orphan resources');
  perform test.assert(not exists (select 1 from public.reports where experience_id = v_live), 'reports about the deleted posts are gone');
  perform test.assert((select details from public.reports where id = v_report_on_other) is null, 'the deleted user report details are cleared');
  perform test.assert((select reporter_id from public.reports where id = v_report_on_other) is null, 'the deleted user is no longer linked to their report');
  perform test.assert(not exists (select 1 from private.user_notices where user_id = test.alice()), 'notices deleted');

  -- Other users' content is untouched
  perform test.assert(exists (select 1 from public.experiences where id = v_other and status = 'approved'), 'other users content remains');
  perform test.assert(exists (select 1 from private.profile_private where user_id = test.bob()), 'other users USN remains');

  -- Audit history survives without any identifier
  perform test.assert((select count(*) from public.moderation_actions where action = 'approve') >= 1, 'audit rows remain');
  perform test.assert(not exists (select 1 from public.moderation_actions where experience_id in (v_live, v_pending, v_draft)), 'audit rows no longer point at deleted posts');
  perform test.assert(not exists (select 1 from public.moderation_actions m where m.actor_role = 'author' and m.actor_id is not null), 'author events never carried an actor id');
  perform test.assert(exists (select 1 from private.deletion_ledger where user_id = test.alice()), 'ledger row written');
  perform test.assert(not exists (select 1 from private.admin_audit where to_jsonb(admin_audit)::text ilike '%' || test.alice()::text || '%'), 'no trace of the user id in the admin audit');

  -- The auth user is then deleted by the server; it cascades cleanly
  delete from auth.users where id = test.alice();
  perform test.assert(not exists (select 1 from auth.users where id = test.alice()), 'auth user deleted');

  -- The deleted user's USN is free again
  perform test.as_user(test.claimant());
  perform test.assert(public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ001') = 'ok', 'the freed USN can be claimed');
  perform test.reset();
end $$;

-- Deleting an auth user directly (e.g. from a dashboard) is blocked while content exists
do $$
declare v_id uuid;
begin
  v_id := test.make_approved(test.bob(), false);
  perform test.expect_error(format($f$ delete from auth.users where id = %L $f$, test.bob()), 'experience_authors_author_id_fkey');
  perform test.assert(exists (select 1 from public.experiences where id = v_id), 'content intact after a blocked direct delete');
end $$;

-- The last admin cannot be deleted even by the service role
do $$
begin
  perform set_config('app.profile_change', '1', true);
  update public.profiles set deletion_requested_at = now() where id = test.admin_y();
  update public.profiles set role = 'student' where id = test.admin_y();
  perform set_config('app.profile_change', '', true);
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.request_account_deletion() $f$, 'last_admin');
  perform test.reset();
end $$;

-- Drafts older than the retention period are purged; recent ones are not (period is a proposal)
do $$
declare v_old uuid; v_new uuid; v_n int;
begin
  perform test.as_user(test.bob());
  v_old := (public.save_draft(null, null, '{"role_title":"Old Draft Synthetic"}'::jsonb) ->> 'id')::uuid;
  v_new := (public.save_draft(null, null, '{"role_title":"New Draft Synthetic"}'::jsonb) ->> 'id')::uuid;
  perform test.reset();
  update public.experiences set updated_at = now() - interval '100 days' where id = v_old;
  perform test.as_service();
  v_n := public.purge_expired_drafts(90);
  perform test.reset();
  perform test.assert(v_n = 1, 'one expired draft purged');
  perform test.assert(not exists (select 1 from public.experiences where id = v_old), 'expired draft gone');
  perform test.assert(exists (select 1 from public.experiences where id = v_new), 'recent draft kept');
  perform test.assert(not exists (select 1 from private.experience_authors where experience_id = v_old), 'its author mapping is gone');
  perform test.as_service();
  perform test.expect_error($f$ select public.purge_expired_drafts(0) $f$, 'invalid_input');
  perform test.reset();
end $$;

-- Ledger purge after 30 days (decision U15 timing)
do $$
declare v_n int;
begin
  insert into private.deletion_ledger (user_id, deleted_at) values (gen_random_uuid(), now() - interval '31 days');
  perform test.as_service();
  v_n := public.purge_deletion_ledger(30);
  perform test.reset();
  perform test.assert(v_n = 1, 'only entries older than 30 days are purged');
end $$;

rollback;
