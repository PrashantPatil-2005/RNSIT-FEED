-- Phase 2: drafts, autosave versioning, submission, duplicate protection, author-only access.
begin;

do $$
declare
  v_res jsonb;
  v_id uuid;
  v_ver integer;
  v_dup uuid;
  v_acme uuid := (select id from public.companies where slug = 'acme-synthetic');
  v_dsa smallint := (select id from public.topics where slug = 'dsa');
begin
  perform test.as_user(test.alice());

  -- A new draft takes department and batch from the profile; a payload cannot override them
  v_res := public.save_draft(null, null, jsonb_build_object('role_title', 'Draft Role', 'department_id', 3, 'batch_id', 2, 'status', 'approved'));
  v_id := (v_res ->> 'id')::uuid;
  v_ver := (v_res ->> 'row_version')::int;
  perform test.assert((select status from public.my_experiences where id = v_id) = 'draft', 'payload cannot set status');
  perform test.assert((public.get_my_experience(v_id) ->> 'department_id')::int = 1, 'department comes from the profile');
  perform test.assert(public.get_my_experience(v_id) ->> 'is_anonymous' is null, 'anonymity is not preselected');

  -- Optimistic concurrency: a stale version is refused, the current one is accepted
  perform test.expect_error(format($f$ select public.save_draft(%L, %s, '{"role_title":"Stale tab"}') $f$, v_id, v_ver - 1), 'version_conflict');
  v_res := public.save_draft(v_id, v_ver, '{"role_title":"Fresh tab"}');
  v_ver := (v_res ->> 'row_version')::int;
  perform test.assert(public.get_my_experience(v_id) ->> 'role_title' = 'Fresh tab', 'current version saves');

  -- Validation inside the database
  perform test.expect_error(format($f$ select public.save_draft(%L, %s, '{"resources":[{"url":"javascript:alert(1)"}]}') $f$, v_id, v_ver), 'invalid_input');
  perform test.expect_error(format($f$ select public.save_draft(%L, %s, '{"rounds":[{"round_type":"oa","difficulty":9}]}') $f$, v_id, v_ver), 'invalid_input');
  perform test.expect_error(format($f$ select public.save_draft(%L, %s, '{"rounds":[{"round_type":"oa","questions":[{"body":"short"}]}]}') $f$, v_id, v_ver), 'invalid_input');
  perform test.expect_error(format($f$ select public.save_draft(%L, %s, '{"min_cgpa":"11"}') $f$, v_id, v_ver), 'invalid_input');
  perform test.expect_error(format($f$ select public.save_draft(%L, %s, '{"company_id":"00000000-0000-4000-8000-000000000000"}') $f$, v_id, v_ver), 'invalid_input');
  perform test.expect_error(format($f$ select public.save_draft(%L, %s, '{"recruitment_year":"1999"}') $f$, v_id, v_ver), 'invalid_input');
  perform test.assert((public.get_my_experience(v_id) ->> 'row_version')::int = v_ver, 'failed saves change nothing');

  -- Incomplete drafts cannot be submitted
  perform test.expect_error(format($f$ select public.submit_experience(%L) $f$, v_id), 'incomplete');

  -- Complete the draft (anonymous) and submit: it goes to pending, never straight to public
  v_res := public.save_draft(v_id, v_ver, jsonb_build_object(
    'company_id', v_acme, 'role_title', 'Phase Two Engineer', 'opportunity_type', 'internship',
    'campus_type', 'off_campus', 'recruitment_year', 2026, 'result', 'waitlisted', 'is_anonymous', true,
    'min_cgpa', 6.5, 'backlogs_allowed', 1, 'eligible_department_ids', jsonb_build_array(1, 2),
    'prep_tips', 'Synthetic tip for phase two',
    'resources', jsonb_build_array(jsonb_build_object('url', 'https://example.test/p2', 'label', 'Synthetic')),
    'rounds', jsonb_build_array(jsonb_build_object('round_type', 'technical', 'duration_min', 40, 'platform', 'Synthetic',
      'difficulty', 4, 'topic_ids', jsonb_build_array(v_dsa),
      'questions', jsonb_build_array(jsonb_build_object('body', 'Synthetic question about binary search trees'))))));
  perform public.submit_experience(v_id);
  perform test.assert((select status from public.my_experiences where id = v_id) = 'pending', 'submitted posts are pending');
  perform test.expect_error(format($f$ select public.submit_experience(%L) $f$, v_id), 'invalid_state');   -- double submit
  perform test.expect_error(format($f$ select public.save_draft(%L, %s, '{"role_title":"Edit while pending"}') $f$, v_id, (v_res ->> 'row_version')::int), 'invalid_state');
  perform test.expect_error(format($f$ select public.delete_draft(%L) $f$, v_id), 'invalid_state');
  perform test.reset();

  -- Pending posts are invisible publicly and to other students
  perform test.as_anon();
  perform test.assert(not exists (select 1 from public.public_experiences where id = v_id), 'pending not public');
  perform test.assert((select count(*) from public.search_experiences('binary search trees')) = 0, 'pending not searchable');
  perform test.reset();
  perform test.as_user(test.bob());
  perform test.expect_error(format($f$ select public.get_my_experience(%L) $f$, v_id), 'not_found');
  perform test.expect_error(format($f$ select public.save_draft(%L, 1, '{"role_title":"Hijack"}') $f$, v_id), 'not_found');
  perform test.expect_error(format($f$ select public.submit_experience(%L) $f$, v_id), 'not_found');
  perform test.expect_error(format($f$ select public.cancel_submission(%L) $f$, v_id), 'not_found');
  perform test.assert(not exists (select 1 from public.my_experiences where id = v_id), 'my_experiences is per author');
  perform test.reset();

  -- Moderators see the pending post without the anonymous author
  perform test.as_user(test.moderator());
  perform test.assert((select author_name from public.moderation_experiences where id = v_id) is null, 'anonymous author hidden from moderators');
  perform test.assert(public.moderation_experience_detail(v_id) ->> 'author_name' is null, 'detail hides anonymous author');
  perform test.reset();

  -- Duplicate protection: same company + role (case/space-insensitive) + year by the same author
  perform test.as_user(test.alice());
  v_res := public.save_draft(null, null, jsonb_build_object(
    'company_id', v_acme, 'role_title', '  phase two ENGINEER ', 'opportunity_type', 'internship',
    'campus_type', 'off_campus', 'recruitment_year', 2026, 'result', 'selected', 'is_anonymous', false,
    'rounds', jsonb_build_array(jsonb_build_object('round_type', 'hr',
      'questions', jsonb_build_array(jsonb_build_object('body', 'Synthetic question number two here'))))));
  v_dup := (v_res ->> 'id')::uuid;
  perform test.expect_error(format($f$ select public.submit_experience(%L) $f$, v_dup), 'duplicate_submission');
  -- A different year is not a duplicate
  perform public.save_draft(v_dup, (v_res ->> 'row_version')::int, '{"recruitment_year":2025}');
  perform public.submit_experience(v_dup);
  perform test.assert((select status from public.my_experiences where id = v_dup) = 'pending', 'different year allowed');
  perform test.reset();

  -- Another author may post the same company/role/year (the guard is per author)
  perform test.as_user(test.bob());
  v_res := public.save_draft(null, null, jsonb_build_object(
    'company_id', v_acme, 'role_title', 'Phase Two Engineer', 'opportunity_type', 'internship',
    'campus_type', 'off_campus', 'recruitment_year', 2026, 'result', 'selected', 'is_anonymous', true,
    'rounds', jsonb_build_array(jsonb_build_object('round_type', 'oa',
      'questions', jsonb_build_array(jsonb_build_object('body', 'Synthetic question from another author'))))));
  perform public.submit_experience((v_res ->> 'id')::uuid);
  perform test.reset();

  -- Cancelling the pending one lets the author resubmit; withdrawing an approved one unblocks a repost
  perform test.as_user(test.alice());
  perform public.cancel_submission(v_id);
  perform test.assert((select status from public.my_experiences where id = v_id) = 'draft', 'cancel returns to draft');
  perform public.submit_experience(v_id);
  perform test.reset();
  perform test.as_user(test.moderator());
  perform public.moderate_experience(v_id, 'approve');
  perform test.reset();
  perform test.as_user(test.alice());
  v_res := public.save_draft(null, null, jsonb_build_object(
    'company_id', v_acme, 'role_title', 'Phase Two Engineer', 'opportunity_type', 'internship',
    'campus_type', 'off_campus', 'recruitment_year', 2026, 'result', 'selected', 'is_anonymous', true,
    'rounds', jsonb_build_array(jsonb_build_object('round_type', 'oa',
      'questions', jsonb_build_array(jsonb_build_object('body', 'Synthetic corrected repost question'))))));
  v_dup := (v_res ->> 'id')::uuid;
  perform test.expect_error(format($f$ select public.submit_experience(%L) $f$, v_dup), 'duplicate_submission');
  perform public.withdraw_experience(v_id);
  perform public.submit_experience(v_dup);
  perform test.assert((select status from public.my_experiences where id = v_dup) = 'pending', 'repost allowed after withdrawal');
  perform test.reset();

  -- Draft cap and deletion
  perform test.as_user(test.bob());
  for i in 1 .. 10 loop
    perform public.save_draft(null, null, '{}'::jsonb);
  end loop;
  perform test.expect_error($f$ select public.save_draft(null, null, '{}'::jsonb) $f$, 'limit_reached');
  perform public.delete_draft((select id from public.my_experiences where status = 'draft' limit 1));
  perform public.save_draft(null, null, '{}'::jsonb);
  perform test.reset();

  -- Visitors cannot draft
  perform test.as_anon();
  perform test.expect_error($f$ select public.save_draft(null, null, '{}'::jsonb) $f$, 'permission denied');
  perform test.expect_error($f$ select public.submit_experience(gen_random_uuid()) $f$, 'permission denied');
  perform test.reset();
end $$;

rollback;
