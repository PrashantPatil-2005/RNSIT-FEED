-- LOCAL DEMO DATA ONLY. NEVER RUN AGAINST A HOSTED PROJECT.
-- Synthetic content for looking at the UI on the local stack. Every company is marked "(demo)" or
-- "Synthetic", every person is synthetic, and nothing here describes a real recruitment process.
-- Requires the test helpers and synthetic seed (run `node supabase/tests/run-supabase.mjs` first).
-- Apply: docker exec -i supabase_db_rnsit-feed psql -U postgres -d postgres < supabase/dev/demo_seed.sql

begin;

insert into public.companies (name, slug) values
  ('Initech (demo)', 'initech-demo'),
  ('Umbrella Systems (demo)', 'umbrella-systems-demo'),
  ('Hooli (demo)', 'hooli-demo')
on conflict do nothing;

create function pg_temp.demo_post(
  p_author uuid, p_company text, p_role text, p_type text, p_campus text, p_result text,
  p_anon boolean, p_rounds jsonb, p_tips text
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform test.as_user(p_author);
  v_id := (public.save_draft(null, null, jsonb_build_object(
    'company_id', (select id from public.companies where slug = p_company),
    'role_title', p_role, 'opportunity_type', p_type, 'campus_type', p_campus,
    'recruitment_year', 2026, 'result', p_result, 'is_anonymous', p_anon,
    'prep_tips', p_tips, 'min_cgpa', 7.0, 'backlogs_allowed', 0,
    'rounds', p_rounds,
    'resources', jsonb_build_array(jsonb_build_object('url', 'https://example.test/demo-guide', 'label', 'Demo guide (synthetic link)'))
  )) ->> 'id')::uuid;
  perform public.submit_experience(v_id);
  perform test.reset();
  perform test.as_user(test.moderator());
  perform public.moderate_experience(v_id, 'approve');
  perform test.reset();
  return v_id;
end $$;

do $$
declare
  dsa smallint := (select id from public.topics where slug = 'dsa');
  dbms smallint := (select id from public.topics where slug = 'dbms');
  os smallint := (select id from public.topics where slug = 'os');
  v uuid;
begin
  v := pg_temp.demo_post(test.alice(), 'initech-demo', 'Software Engineer (demo)', 'full_time', 'on_campus', 'selected', false,
    jsonb_build_array(
      jsonb_build_object('round_type', 'oa', 'difficulty', 3, 'duration_min', 90, 'platform', 'Online test platform (demo)',
        'topic_ids', jsonb_build_array(dsa),
        'questions', jsonb_build_array(
          jsonb_build_object('body', 'Demo question: find the longest substring without repeating characters.'),
          jsonb_build_object('body', 'Demo question: count islands in a grid of land and water cells.'))),
      jsonb_build_object('round_type', 'technical', 'difficulty', 4, 'duration_min', 45,
        'topic_ids', jsonb_build_array(dsa, dbms),
        'questions', jsonb_build_array(
          jsonb_build_object('body', 'Demo question: explain database normalisation up to third normal form.'),
          jsonb_build_object('body', 'Demo question: design a rate limiter and discuss trade-offs.'))),
      jsonb_build_object('round_type', 'hr', 'difficulty', 2, 'duration_min', 20,
        'questions', jsonb_build_array(jsonb_build_object('body', 'Demo question: describe a project you are proud of.')))),
    'Synthetic tip: practise timed problems and revise core subjects the week before.');

  v := pg_temp.demo_post(test.bob(), 'initech-demo', 'Data Analyst Intern (demo)', 'internship', 'on_campus', 'waitlisted', true,
    jsonb_build_array(
      jsonb_build_object('round_type', 'oa', 'difficulty', 2, 'duration_min', 60, 'topic_ids', jsonb_build_array(dbms),
        'questions', jsonb_build_array(jsonb_build_object('body', 'Demo question: write a SQL query for the second highest salary.'))),
      jsonb_build_object('round_type', 'gd', 'difficulty', 3, 'duration_min', 30,
        'questions', jsonb_build_array(jsonb_build_object('body', 'Demo topic: remote work versus office work.')))),
    'Synthetic tip: SQL joins and window functions came up repeatedly.');

  v := pg_temp.demo_post(test.alice(), 'umbrella-systems-demo', 'Systems Engineer (demo)', 'full_time', 'off_campus', 'rejected', true,
    jsonb_build_array(
      jsonb_build_object('round_type', 'technical', 'difficulty', 5, 'duration_min', 60, 'topic_ids', jsonb_build_array(os),
        'questions', jsonb_build_array(
          jsonb_build_object('body', 'Demo question: explain how virtual memory and paging work.'),
          jsonb_build_object('body', 'Demo question: what causes a deadlock and how can it be prevented?'))),
      jsonb_build_object('round_type', 'managerial', 'difficulty', 3, 'duration_min', 30,
        'questions', jsonb_build_array(jsonb_build_object('body', 'Demo question: how would you handle a missed deadline?')))),
    'Synthetic tip: operating systems fundamentals mattered more than competitive programming.');

  v := pg_temp.demo_post(test.bob(), 'hooli-demo', 'Product Engineer (demo)', 'both', 'on_campus', 'selected', false,
    jsonb_build_array(
      jsonb_build_object('round_type', 'oa', 'difficulty', 4, 'duration_min', 120, 'topic_ids', jsonb_build_array(dsa),
        'questions', jsonb_build_array(jsonb_build_object('body', 'Demo question: shortest path in a weighted graph with constraints.'))),
      jsonb_build_object('round_type', 'technical', 'difficulty', 4, 'duration_min', 50, 'topic_ids', jsonb_build_array(dsa),
        'questions', jsonb_build_array(jsonb_build_object('body', 'Demo question: implement an LRU cache.'))),
      jsonb_build_object('round_type', 'hr', 'difficulty', 1, 'duration_min', 15,
        'questions', jsonb_build_array(jsonb_build_object('body', 'Demo question: why this role?')))),
    'Synthetic tip: explain your thinking aloud during the technical round.');

  v := pg_temp.demo_post(test.alice(), 'acme-synthetic', 'Associate Engineer (demo)', 'full_time', 'on_campus', 'selected', false,
    jsonb_build_array(
      jsonb_build_object('round_type', 'oa', 'difficulty', 2, 'duration_min', 60, 'topic_ids', jsonb_build_array(dsa),
        'questions', jsonb_build_array(jsonb_build_object('body', 'Demo question: reverse a linked list in groups of k.')))),
    null);

  -- Engagement: a named comment, and a comment by the author of an anonymous post (shows no name)
  perform test.as_user(test.moderator());
  perform public.set_helpful_vote((select id from public.public_experiences where role_title = 'Software Engineer (demo)'), true);
  perform public.add_comment((select id from public.public_experiences where role_title = 'Software Engineer (demo)'),
    'Synthetic comment: was the online test proctored?');
  perform test.reset();
  perform test.as_user(test.bob());
  perform public.add_comment((select id from public.public_experiences where role_title = 'Software Engineer (demo)'),
    'Synthetic comment: thanks, this helped my preparation.');
  perform test.reset();
end $$;

commit;
