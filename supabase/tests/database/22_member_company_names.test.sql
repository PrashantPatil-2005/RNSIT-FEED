-- Free company entry: typed names link to existing companies (name or alias), new names become an
-- unlisted company at submit, approval lists it, and unused unlisted companies disappear.
begin;

do $$
declare
  v_acme uuid := (select id from public.companies where slug = 'acme-synthetic');
  v_body jsonb;
  v_res jsonb;
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_new uuid;
begin
  v_body := jsonb_build_object(
    'role_title', 'Synthetic Company Role', 'opportunity_type', 'internship',
    'campus_type', 'off_campus', 'recruitment_year', 2026, 'result', 'selected', 'is_anonymous', false,
    'rounds', jsonb_build_array(jsonb_build_object('round_type', 'technical',
      'questions', jsonb_build_array(jsonb_build_object('body', 'Synthetic question about hash maps')))));

  perform test.as_user(test.alice());

  -- Alias match (case and spacing ignored) links the existing company at save time
  v_res := public.save_draft(null, null, v_body || '{"company_name":"  acme   LTD "}');
  v_a := (v_res ->> 'id')::uuid;
  perform test.assert((public.get_my_experience(v_a) ->> 'company_id')::uuid = v_acme, 'alias links existing company');
  perform test.assert(public.get_my_experience(v_a) ->> 'company_name' = 'Acme Synthetic', 'linked company name shown');

  -- Unknown name: kept as typed, no company yet, nothing created by autosave
  v_res := public.save_draft(null, null, v_body || '{"company_name":"Zeta  Synthetic Labs","role_title":"Other Role"}');
  v_b := (v_res ->> 'id')::uuid;
  perform test.assert(public.get_my_experience(v_b) ->> 'company_id' is null, 'unknown name not linked');
  perform test.assert(public.get_my_experience(v_b) ->> 'company_name' = 'Zeta Synthetic Labs', 'typed name kept, whitespace collapsed');
  perform test.assert((select company_name from public.my_experiences where id = v_b) = 'Zeta Synthetic Labs', 'my_experiences shows typed name');
  perform test.assert(not exists (select 1 from public.companies where lower(name) = 'zeta synthetic labs'), 'autosave creates no company');

  -- Submit creates the company unlisted and links it
  perform public.submit_experience(v_b);
  v_new := (select company_id from public.my_experiences where id = v_b);
  perform test.assert(v_new is not null, 'submit links a company');
  perform test.assert(not exists (select 1 from public.companies where id = v_new), 'unlisted company hidden from members');
  perform test.reset();

  perform test.as_anon();
  perform test.assert(not exists (select 1 from public.companies where id = v_new), 'unlisted company hidden from visitors');
  perform test.reset();

  -- A second author typing the same name (different case) shares the company, no duplicate
  perform test.as_user(test.bob());
  v_res := public.save_draft(null, null, v_body || '{"company_name":"zeta synthetic labs"}');
  v_c := (v_res ->> 'id')::uuid;
  perform test.assert((public.get_my_experience(v_c) ->> 'company_id')::uuid = v_new, 'same name links the unlisted company');
  perform public.submit_experience(v_c);
  perform test.reset();

  -- Moderators see the new company flagged, then approval lists it
  perform test.as_user(test.moderator());
  perform test.assert((select company_listed from public.moderation_experiences where id = v_b) is false, 'queue flags new company');
  perform test.assert((public.moderation_experience_detail(v_b) ->> 'company_listed')::boolean is false, 'detail flags new company');
  perform test.assert((select slug from public.companies where id = v_new) = 'zeta-synthetic-labs', 'slug generated');
  perform public.moderate_experience(v_b, 'approve');
  perform test.reset();

  perform test.as_anon();
  perform test.assert(exists (select 1 from public.companies where id = v_new and name = 'Zeta Synthetic Labs'), 'approval lists the company');
  perform test.reset();

  -- Orphan cleanup: a rejected-then-deleted post removes its unlisted company
  perform test.as_user(test.alice());
  v_res := public.save_draft(null, null, v_body || '{"company_name":"Omega Synthetic Orphan","role_title":"Orphan Role"}');
  v_a := (v_res ->> 'id')::uuid;
  perform public.submit_experience(v_a);
  v_new := (select company_id from public.my_experiences where id = v_a);
  perform test.reset();
  perform test.as_user(test.moderator());
  perform public.moderate_experience(v_a, 'reject', 'low_quality', 'Synthetic rejection note');
  perform test.reset();
  perform test.as_user(test.alice());
  perform public.delete_draft(v_a);
  perform test.reset();
  perform test.as_service();
  perform test.assert(not exists (select 1 from public.companies where id = v_new), 'unused unlisted company deleted');
  perform test.reset();

  -- Returned post re-pointed to an existing company drops the unlisted one
  perform test.as_user(test.alice());
  v_res := public.save_draft(null, null, v_body || '{"company_name":"Typo Synthetic Co","role_title":"Typo Role"}');
  v_a := (v_res ->> 'id')::uuid;
  perform public.submit_experience(v_a);
  v_new := (select company_id from public.my_experiences where id = v_a);
  perform test.reset();
  perform test.as_user(test.moderator());
  perform public.moderate_experience(v_a, 'return', 'low_quality', 'Please use the listed company');
  perform test.reset();
  perform test.as_user(test.alice());
  perform public.save_draft(v_a, (select row_version from public.my_experiences where id = v_a), '{"company_name":"Acme Synthetic"}');
  perform test.assert((select company_id from public.my_experiences where id = v_a) = v_acme, 're-pointed to existing');
  perform test.reset();
  perform test.as_service();
  perform test.assert(not exists (select 1 from public.companies where id = v_new), 'replaced unlisted company deleted');
  perform test.assert(exists (select 1 from public.companies where id = v_acme), 'listed companies never auto-deleted');
  perform test.reset();

  -- Empty name means no company; submit refuses it
  perform test.as_user(test.alice());
  v_res := public.save_draft(null, null, v_body || '{"company_name":"   ","role_title":"Blank Company Role"}');
  perform test.expect_error(format($f$ select public.submit_experience(%L) $f$, v_res ->> 'id'), 'incomplete');
  perform test.reset();
end $$;

rollback;
