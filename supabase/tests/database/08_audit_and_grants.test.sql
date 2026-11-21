-- Audit tables are append-only; every table has RLS; grants match an allow-list.
begin;

-- Append-only: UPDATE, DELETE and TRUNCATE are refused even for the owner role
do $$
declare v_id uuid;
begin
  v_id := test.make_approved(test.alice(), false);
  perform test.expect_error($f$ update public.moderation_actions set actor_role = 'admin' $f$, 'audit_immutable');
  perform test.expect_error($f$ update public.moderation_actions set reason_code = 'other' $f$, 'audit_immutable');
  perform test.expect_error($f$ delete from public.moderation_actions $f$, 'audit_immutable');
  perform test.expect_error($f$ truncate public.moderation_actions $f$, 'audit_immutable');
  perform test.expect_error($f$ update private.admin_audit set reason = 'rewritten history' $f$, 'audit_immutable');
  perform test.expect_error($f$ delete from private.admin_audit $f$, 'audit_immutable');
  perform test.expect_error($f$ truncate private.admin_audit $f$, 'audit_immutable');
  -- API roles cannot touch them at all
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ delete from public.moderation_actions $f$, 'permission denied');
  perform test.expect_error($f$ update private.admin_audit set reason = 'rewritten history' $f$, 'permission denied');
  perform test.reset();
  -- The only permitted change is a foreign key going to NULL (what ON DELETE SET NULL does)
  update public.moderation_actions set experience_id = null where experience_id = v_id and action = 'approve';
  perform test.assert(exists (select 1 from public.moderation_actions where experience_id is null and action = 'approve'), 'SET NULL is allowed');
  perform test.expect_error($f$ update public.moderation_actions set actor_id = gen_random_uuid() where actor_id is null $f$, 'audit_immutable');
end $$;

-- The moderator log has no free-text column and no admin-only event type
do $$
begin
  perform test.assert(not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'moderation_actions'
      and data_type in ('text', 'character varying') and column_name not in ('actor_role')
  ), 'the moderator log has no free-text column');
  perform test.assert(not exists (
    select 1 from unnest(enum_range(null::public.mod_action)) a
    where a::text in ('view_usn', 'reveal_author', 'set_role', 'execute_usn_release')
  ), 'admin-only events are not in the moderator log enum');
end $$;

-- Row Level Security is enabled on every table in public and private
do $$
declare v_missing text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ') into v_missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('public', 'private') and not c.relrowsecurity;
  perform test.assert(v_missing is null, 'RLS missing on: ' || coalesce(v_missing, ''));
end $$;

-- Table privileges for API roles match an allow-list: no writes anywhere, reads only where intended
do $$
declare v_bad text;
begin
  select string_agg(distinct g.grantee || ':' || g.table_schema || '.' || g.table_name || ':' || g.privilege_type, ', ')
  into v_bad
  from information_schema.role_table_grants g
  where g.grantee in ('anon', 'authenticated', 'PUBLIC')
    and g.table_schema in ('public', 'private')
    and g.privilege_type <> 'SELECT';
  perform test.assert(v_bad is null, 'API roles hold write privileges: ' || coalesce(v_bad, ''));

  select string_agg(distinct g.grantee || ':' || g.table_schema || '.' || g.table_name, ', ')
  into v_bad
  from information_schema.role_table_grants g
  where g.grantee in ('anon', 'authenticated', 'PUBLIC')
    and g.table_schema in ('public', 'private')
    and g.privilege_type = 'SELECT'
    and not (
      (g.table_schema = 'public' and g.table_name in (
        'departments', 'batches', 'topics', 'companies', 'company_aliases',
        'public_experiences', 'public_rounds', 'public_questions', 'public_resources',
        'public_eligible_departments', 'company_stats', 'public_engagement', 'public_comments'))
      or (g.grantee = 'authenticated' and g.table_schema = 'public' and g.table_name in (
        'profiles', 'my_experiences', 'my_moderation_feedback', 'my_reports', 'my_notices',
        'moderation_experiences', 'moderation_reports', 'moderation_history',
        'my_votes', 'my_comments', 'my_comment_reports', 'moderation_comments', 'moderation_comment_reports'))
    );
  perform test.assert(v_bad is null, 'unexpected SELECT grants: ' || coalesce(v_bad, ''));

  perform test.assert(not exists (
    select 1 from information_schema.role_table_grants g
    where g.grantee in ('anon', 'authenticated') and g.table_schema = 'private'
  ), 'API roles hold no privilege on any private table');
end $$;

-- Function EXECUTE grants match an allow-list (nothing reachable by default or by PUBLIC)
do $$
declare v_bad text;
begin
  -- anon may execute exactly two functions: search, and site_status (public switches and the
  -- banner notice only; migration 026). PUBLIC may execute none.
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and ((has_function_privilege('anon', p.oid, 'execute') and p.proname not in ('search_experiences', 'site_status'))
      or (has_function_privilege('public', p.oid, 'execute') and p.proname <> 'search_experiences'));
  perform test.assert(v_bad is null, 'anon or PUBLIC can execute: ' || coalesce(v_bad, ''));

  -- authenticated may execute only the documented member/staff/admin functions and two helpers
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and has_function_privilege('authenticated', p.oid, 'execute')
    and p.proname not in (
      'search_experiences', 'complete_onboarding', 'get_my_usn', 'save_draft', 'delete_draft',
      'get_my_experience', 'submit_experience', 'withdraw_experience', 'report_experience',
      'mark_notice_read', 'request_account_deletion', 'cancel_account_deletion', 'my_deletion_cancellable', 'request_usn_review', 'object_to_usn_release',
      'moderate_experience', 'resolve_report', 'moderation_experience_detail',
      'admin_set_user_role', 'admin_correct_name', 'admin_reveal_author', 'admin_get_usn',
      'admin_create_company', 'admin_add_company_alias', 'admin_create_topic', 'admin_rename_topic', 'admin_owner_id', 'admin_list_audit',
      'site_status', 'admin_list_settings', 'admin_set_setting',
      'admin_rename_company', 'admin_remove_company_alias', 'admin_merge_companies', 'admin_delete_company',
      'admin_set_topic_active', 'admin_delete_topic', 'admin_create_department', 'admin_update_department',
      'admin_create_batch', 'admin_delete_batch', 'admin_reference_usage',
      'admin_set_suspended', 'admin_set_user_details', 'admin_request_user_deletion',
      'admin_remove_user_comments', 'admin_edit_post', 'admin_delete_post', 'admin_post_detail',
      'admin_usn_case_take', 'admin_usn_case_notify', 'admin_usn_case_approve',
      'admin_usn_case_deny', 'admin_usn_case_execute',
      'cancel_submission', 'set_helpful_vote', 'add_comment', 'delete_my_comment', 'report_comment',
      'moderate_comment', 'resolve_comment_report',
      'admin_invite_alumnus', 'admin_revoke_alumni_invite', 'admin_list_alumni_invites',
      'moderator_step_down', 'admin_assign_moderator_department', 'admin_unassign_moderator_department',
      'my_moderator_departments', 'admin_moderator_coverage', 'admin_user_role_history',
      'my_moderation_activity', 'admin_moderator_activity',
      'is_admin', 'is_staff', 'uid'   -- uid is auth.uid(), outside these schemas; listed for clarity
    );
  perform test.assert(v_bad is null, 'authenticated can execute unexpected functions: ' || coalesce(v_bad, ''));

  -- service_role-only functions are not reachable by authenticated users
  perform test.assert(not has_function_privilege('authenticated', 'public.delete_account_data(uuid)', 'execute'), 'deletion is service-role only');
  perform test.assert(has_function_privilege('service_role', 'public.delete_account_data(uuid)', 'execute'), 'service role can run deletion');
  perform test.assert(not has_function_privilege('authenticated', 'public.purge_expired_drafts(integer)', 'execute'), 'purge is service-role only');
  perform test.assert(not has_function_privilege('authenticated', 'public.purge_rejected_experiences(integer)', 'execute'), 'rejected purge is service-role only');
  perform test.assert(has_function_privilege('service_role', 'public.purge_rejected_experiences(integer)', 'execute'), 'service role can purge rejected posts');
  perform test.assert(not has_function_privilege('authenticated', 'public.purge_expired_alumni_invites()', 'execute'), 'invite purge is service-role only');
  perform test.assert(has_function_privilege('service_role', 'public.purge_expired_alumni_invites()', 'execute'), 'service role can purge expired invites');
  perform test.assert(not has_function_privilege('anon', 'public.hook_before_user_created(jsonb)', 'execute'), 'the hook is not callable by anon');
  perform test.assert(has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'), 'the hook is callable by the auth service');
  perform test.assert(not has_function_privilege('authenticated', 'private.bootstrap_admin(uuid,text)', 'execute'), 'bootstrap is owner-only');
end $$;

-- Every function that is SECURITY DEFINER pins search_path
do $$
declare v_bad text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  perform test.assert(v_bad is null, 'SECURITY DEFINER without search_path: ' || coalesce(v_bad, ''));
end $$;

-- View column allow-list: a new public-view column must be reviewed deliberately
do $$
declare v_cols text;
begin
  select string_agg(table_name || '.' || column_name, ', ' order by table_name, ordinal_position) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'public_experiences';
  perform test.assert(v_cols = 'public_experiences.id, public_experiences.company_name, public_experiences.company_slug, public_experiences.role_title, public_experiences.opportunity_type, public_experiences.campus_type, public_experiences.department_code, public_experiences.department_name, public_experiences.batch_year, public_experiences.recruitment_year, public_experiences.min_cgpa, public_experiences.backlogs_allowed, public_experiences.result, public_experiences.prep_tips, public_experiences.is_anonymous, public_experiences.author_name, public_experiences.published_on',
    'public_experiences columns changed; review them: ' || v_cols);
end $$;

rollback;
