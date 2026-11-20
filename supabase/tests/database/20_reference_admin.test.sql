-- Reference data management (migration 028): admin-only, audited; hide by default, delete only
-- when unused; company rename keeps the old name searchable; merge moves locked posts safely.
begin;

-- Only admins
do $$
declare
  v_uid uuid;
  v_acme uuid := (select id from public.companies where slug = 'acme-synthetic');
  v_dsa smallint := (select id from public.topics where slug = 'dsa');
begin
  perform test.as_anon();
  perform test.expect_error(format($f$ select public.admin_rename_company(%L::uuid, 'X Co', 'Synthetic reference change') $f$, v_acme), 'permission denied');
  perform test.expect_error($f$ select * from public.admin_reference_usage() $f$, 'permission denied');
  perform test.reset();
  foreach v_uid in array array[test.alice(), test.moderator()] loop
    perform test.as_user(v_uid);
    perform test.expect_error(format($f$ select public.admin_rename_company(%L::uuid, 'X Co', 'Synthetic reference change') $f$, v_acme), 'forbidden');
    perform test.expect_error(format($f$ select public.admin_delete_company(%L::uuid, 'Synthetic reference change') $f$, v_acme), 'forbidden');
    perform test.expect_error(format($f$ select public.admin_set_topic_active(%s::smallint, false, 'Synthetic reference change') $f$, v_dsa), 'forbidden');
    perform test.expect_error($f$ select public.admin_create_department('ZZ', 'Synthetic Dept', 'Synthetic reference change') $f$, 'forbidden');
    perform test.expect_error($f$ select public.admin_create_batch(2099::smallint, 'Synthetic reference change') $f$, 'forbidden');
    perform test.expect_error($f$ select * from public.admin_reference_usage() $f$, 'forbidden');
    perform test.expect_error($f$ update public.topics set active = false $f$, 'permission denied');
    perform test.reset();
  end loop;
end $$;

-- Company rename: old name kept as alias, address unchanged, search finds both, audited
do $$
declare
  v_post uuid := test.make_approved(test.alice(), false, 'globex-synthetic');
  v_globex uuid := (select id from public.companies where slug = 'globex-synthetic');
  v_audit integer := (select count(*) from private.admin_audit where action = 'manage_company');
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_rename_company(%L::uuid, 'Acme Synthetic', 'Synthetic reference change') $f$, v_globex), 'companies_name_lower_key');
  perform test.expect_error(format($f$ select public.admin_rename_company(%L::uuid, '  ', 'Synthetic reference change') $f$, v_globex), 'invalid_input');
  perform public.admin_rename_company(v_globex, ' Globex Corporation ', 'Synthetic reference change');
  perform test.reset();
  perform test.assert((select name || '|' || slug from public.companies where id = v_globex) = 'Globex Corporation|globex-synthetic', 'renamed, address unchanged');
  perform test.assert(exists (select 1 from public.company_aliases where company_id = v_globex and alias = 'Globex Synthetic'), 'old name kept as alias');
  perform test.assert((select count(*) from private.admin_audit where action = 'manage_company') = v_audit + 1, 'rename audited once');
  perform test.as_anon();
  perform test.assert(exists (select 1 from public.search_experiences('Globex Synthetic') s where s.id = v_post), 'search finds the old name');
  perform test.assert(exists (select 1 from public.search_experiences('Globex Corporation') s where s.id = v_post), 'search finds the new name');
  perform test.reset();

  -- Remove alias
  perform test.as_user(test.admin_x());
  perform public.admin_remove_company_alias(v_globex, 'globex synthetic', 'Synthetic reference change');
  perform test.expect_error(format($f$ select public.admin_remove_company_alias(%L::uuid, 'Nope', 'Synthetic reference change') $f$, v_globex), 'not_found');
  perform test.reset();
  perform test.assert(not exists (select 1 from public.company_aliases where company_id = v_globex), 'alias removed');
end $$;

-- Delete only unused companies
do $$
declare
  v_acme uuid := (select id from public.companies where slug = 'acme-synthetic');
  v_new uuid;
begin
  perform test.make_pending(test.bob(), false, 'acme-synthetic');
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_delete_company(%L::uuid, 'Synthetic reference change') $f$, v_acme), 'in_use');
  v_new := public.admin_create_company('Unused Synthetic', 'unused-synthetic', 'Synthetic reference change');
  perform public.admin_add_company_alias(v_new, 'Unused Alias', 'Synthetic reference change');
  perform public.admin_delete_company(v_new, 'Synthetic reference change');
  perform test.reset();
  perform test.assert(not exists (select 1 from public.companies where id = v_new), 'unused company deleted');
  perform test.assert(not exists (select 1 from public.company_aliases where alias = 'Unused Alias'), 'its aliases went with it');
  perform test.assert(exists (select 1 from public.companies where id = v_acme), 'used company kept');
end $$;

-- Merge: approved (locked) posts move, aliases move, old name becomes alias, source deleted
do $$
declare
  v_dup uuid;
  v_acme uuid := (select id from public.companies where slug = 'acme-synthetic');
  v_post uuid;
  v_moved integer;
  v_status public.exp_status;
begin
  perform test.as_user(test.admin_x());
  v_dup := public.admin_create_company('Acme Duplicate', 'acme-duplicate', 'Synthetic reference change');
  perform public.admin_add_company_alias(v_dup, 'ACME Dup', 'Synthetic reference change');
  perform test.reset();
  v_post := test.make_approved(test.alice(), true, 'acme-duplicate');
  v_status := (select status from public.experiences where id = v_post);

  -- Moving a locked post outside a merge is still refused
  perform test.expect_error(format($f$ update public.experiences set company_id = %L::uuid where id = %L::uuid $f$, v_acme, v_post), 'content_locked');

  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_merge_companies(%L::uuid, %L::uuid, 'Synthetic reference change') $f$, v_dup, v_dup), 'invalid_input');
  v_moved := public.admin_merge_companies(v_dup, v_acme, 'Synthetic duplicate merge');
  perform test.reset();

  perform test.assert(v_moved = 1, 'one post moved');
  perform test.assert((select company_id from public.experiences where id = v_post) = v_acme, 'post now under the target');
  perform test.assert((select status from public.experiences where id = v_post) = v_status, 'post status unchanged');
  perform test.assert((select is_anonymous from public.experiences where id = v_post), 'other columns unchanged');
  perform test.assert(not exists (select 1 from public.companies where id = v_dup), 'duplicate deleted');
  perform test.assert(exists (select 1 from public.company_aliases where company_id = v_acme and alias = 'ACME Dup'), 'aliases moved');
  perform test.assert(exists (select 1 from public.company_aliases where company_id = v_acme and alias = 'Acme Duplicate'), 'old name kept as alias');
  perform test.assert(current_setting('app.company_merge', true) is distinct from '1', 'merge flag cleared');
  perform test.as_anon();
  perform test.assert(exists (select 1 from public.search_experiences('Acme Duplicate') s where s.id = v_post), 'search finds the merged name');
  perform test.reset();
end $$;

-- Topics: hide, show, delete only unused
do $$
declare
  v_dsa smallint := (select id from public.topics where slug = 'dsa');
  v_new smallint;
begin
  perform test.as_user(test.admin_x());
  perform public.admin_set_topic_active(v_dsa, false, 'Synthetic reference change');
  perform test.reset();
  perform test.assert(not (select active from public.topics where id = v_dsa), 'topic hidden');
  perform test.as_anon();
  perform test.assert(exists (select 1 from public.topics where id = v_dsa and not active), 'hidden topics still readable for old posts');
  perform test.reset();
  perform test.as_user(test.admin_x());
  perform public.admin_set_topic_active(v_dsa, true, 'Synthetic reference change');
  perform test.expect_error(format($f$ select public.admin_delete_topic(%s::smallint, 'Synthetic reference change') $f$, v_dsa), 'in_use');
  v_new := public.admin_create_topic('Unused Synthetic Topic', 'unused-topic', 'Synthetic reference change');
  perform public.admin_delete_topic(v_new, 'Synthetic reference change');
  perform test.expect_error($f$ select public.admin_delete_topic(32000::smallint, 'Synthetic reference change') $f$, 'not_found');
  perform test.reset();
  perform test.assert((select active from public.topics where id = v_dsa), 'topic shown again');
  perform test.assert(not exists (select 1 from public.topics where id = v_new), 'unused topic deleted');
end $$;

-- Departments: add, rename, hide; codes are fixed
do $$
declare
  v_id smallint;
  v_audit integer := (select count(*) from private.admin_audit where action = 'manage_reference');
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.admin_create_department('Z1', 'Synthetic Dept', 'Synthetic reference change') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_create_department('ZZZ', 'Synthetic Dept', 'Synthetic reference change') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_create_department('cs', 'Duplicate', 'Synthetic reference change') $f$, 'departments_code_key');
  v_id := public.admin_create_department(' zq ', ' Synthetic Quantum ', 'Synthetic reference change');
  perform public.admin_update_department(v_id, 'Synthetic Quantum Eng', false, 'Synthetic reference change');
  perform test.expect_error(format($f$ select public.admin_update_department(%s::smallint, 'X', true, 'Synthetic reference change') $f$, v_id), 'invalid_input');
  perform test.reset();
  perform test.assert((select code || '|' || name || '|' || active from public.departments where id = v_id) = 'ZQ|Synthetic Quantum Eng|false', 'department added, renamed and hidden');
  perform test.assert((select count(*) from private.admin_audit where action = 'manage_reference') = v_audit + 2, 'department changes audited');
end $$;

-- Batches: add, delete only unused
do $$
declare
  v_id smallint;
  v_used smallint := (select batch_id from public.profiles where id = test.alice());
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.admin_create_batch(1999::smallint, 'Synthetic reference change') $f$, 'invalid_input');
  v_id := public.admin_create_batch(2099::smallint, 'Synthetic reference change');
  perform test.expect_error($f$ select public.admin_create_batch(2099::smallint, 'Synthetic reference change') $f$, 'batches_grad_year_key');
  perform test.expect_error(format($f$ select public.admin_delete_batch(%s::smallint, 'Synthetic reference change') $f$, v_used), 'in_use');
  perform public.admin_delete_batch(v_id, 'Synthetic reference change');
  perform test.reset();
  perform test.assert(not exists (select 1 from public.batches where grad_year = 2099), 'unused batch deleted');
end $$;

-- Usage counts
do $$
declare
  v_acme uuid := (select id from public.companies where slug = 'acme-synthetic');
  v_count integer := (select count(*) from public.experiences where company_id = v_acme);
begin
  perform test.as_user(test.admin_x());
  perform test.assert((select uses from public.admin_reference_usage() where kind = 'company' and ref_id = v_acme::text)
    = v_count, 'company usage matches');
  perform test.assert(exists (select 1 from public.admin_reference_usage() where kind = 'department'), 'department usage listed');
  perform test.reset();
end $$;

rollback;
