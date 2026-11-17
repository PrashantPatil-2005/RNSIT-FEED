-- Drafts are private; autosave cannot overwrite newer versions or publish content.
begin;

do $$
declare
  v_res jsonb;
  v_id uuid;
  v_v1 jsonb;
begin
  perform test.as_user(test.alice());
  v_res := public.save_draft(null, null, '{"role_title":"Draft Role Synthetic"}'::jsonb);
  v_id := (v_res ->> 'id')::uuid;
  perform test.assert((v_res ->> 'row_version')::int = 1, 'first save returns version 1');
  perform test.assert((select status from public.my_experiences where id = v_id) = 'draft', 'new post is a draft');

  -- Another user cannot see, read, edit, delete or submit it, and gets the same error as for a missing id
  perform test.reset();
  perform test.as_user(test.bob());
  perform test.assert((select count(*) from public.my_experiences) = 0, 'other user sees none of the drafts');
  perform test.expect_error(format($f$ select public.get_my_experience(%L) $f$, v_id), 'not_found');
  perform test.expect_error(format($f$ select public.save_draft(%L, 1, '{"role_title":"stolen"}'::jsonb) $f$, v_id), 'not_found');
  perform test.expect_error(format($f$ select public.delete_draft(%L) $f$, v_id), 'not_found');
  perform test.expect_error(format($f$ select public.submit_experience(%L) $f$, v_id), 'not_found');
  perform test.expect_error($f$ select public.get_my_experience('00000000-0000-4000-8000-0000000000ff') $f$, 'not_found');
  perform test.reset();

  -- Visitors cannot see drafts anywhere
  perform test.as_anon();
  perform test.assert((select count(*) from public.public_experiences) = 0, 'drafts are not public');
  perform test.assert((select count(*) from public.search_experiences()) = 0, 'drafts are not searchable');
  perform test.reset();

  -- Version control: stale save rejected, correct version accepted, newer content not lost
  perform test.as_user(test.alice());
  v_res := public.save_draft(v_id, 1, '{"role_title":"Second Save Synthetic"}'::jsonb);
  perform test.assert((v_res ->> 'row_version')::int = 2, 'second save returns version 2');
  perform test.expect_error(format($f$ select public.save_draft(%L, 1, '{"role_title":"Stale Tab Overwrite"}'::jsonb) $f$, v_id), 'version_conflict');
  perform test.expect_error(format($f$ select public.save_draft(%L, null, '{"role_title":"No Version Given"}'::jsonb) $f$, v_id), 'version_conflict');
  v_v1 := public.get_my_experience(v_id);
  perform test.assert(v_v1 ->> 'role_title' = 'Second Save Synthetic', 'the newer content survived the stale save');

  -- Recovery on another device: the full content comes back
  v_res := public.save_draft(v_id, 2, jsonb_build_object(
    'rounds', jsonb_build_array(jsonb_build_object('round_type', 'hr', 'questions',
      jsonb_build_array(jsonb_build_object('body', 'Tell us about yourself please')))),
    'resources', jsonb_build_array(jsonb_build_object('url', 'https://example.test/a'))));
  v_v1 := public.get_my_experience(v_id);
  perform test.assert(jsonb_array_length(v_v1 -> 'rounds') = 1, 'rounds are recoverable');
  perform test.assert(jsonb_array_length(v_v1 -> 'resources') = 1, 'resources are recoverable');

  -- Autosave can never publish: a status key is ignored, direct status writes are denied
  v_res := public.save_draft(v_id, 3, '{"status":"approved","is_anonymous":true}'::jsonb);
  perform test.assert((select status from public.my_experiences where id = v_id) = 'draft', 'a status key in the payload is ignored');
  perform test.expect_error(format($f$ update public.experiences set status = 'approved' where id = %L $f$, v_id), 'permission denied');

  -- Invalid input is rejected without leaking details
  perform test.expect_error(format($f$ select public.save_draft(%L, 4, '{"opportunity_type":"not-a-type"}'::jsonb) $f$, v_id), 'invalid_input');
  perform test.expect_error(format($f$ select public.save_draft(%L, 4, jsonb_build_object('resources', jsonb_build_array(jsonb_build_object('url','javascript:alert(1)')))) $f$, v_id), 'invalid_input');
  perform test.expect_error(format($f$ select public.save_draft(%L, 4, '[1,2]'::jsonb) $f$, v_id), 'invalid_input');

  -- After submit, autosave is refused
  v_res := public.save_draft(v_id, 4, jsonb_build_object(
    'company_id', (select id from public.companies where slug = 'acme-synthetic'),
    'role_title', 'Ready Role Synthetic', 'opportunity_type', 'internship', 'campus_type', 'off_campus',
    'recruitment_year', 2026, 'result', 'waitlisted', 'is_anonymous', false));
  perform public.submit_experience(v_id);
  perform test.expect_error(format($f$ select public.save_draft(%L, 5, '{"role_title":"late edit"}'::jsonb) $f$, v_id), 'invalid_state');
  perform test.assert((select status from public.my_experiences where id = v_id) = 'pending', 'submitted post is pending');
  perform test.reset();
end $$;

-- Draft cap
do $$
declare i int;
begin
  perform test.as_user(test.bob());
  for i in 1 .. 10 loop
    perform public.save_draft(null, null, '{}'::jsonb);
  end loop;
  perform test.expect_error($f$ select public.save_draft(null, null, '{}'::jsonb) $f$, 'limit_reached');
  perform test.reset();
end $$;

-- Incomplete posts cannot be submitted
do $$
declare v_id uuid;
begin
  perform test.as_user(test.alice());
  v_id := (public.save_draft(null, null, '{"role_title":"Incomplete Synthetic"}'::jsonb) ->> 'id')::uuid;
  perform test.expect_error(format($f$ select public.submit_experience(%L) $f$, v_id), 'incomplete');
  perform test.reset();
end $$;

rollback;
