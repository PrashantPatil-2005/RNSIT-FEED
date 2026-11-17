-- Row Level Security and explicit grants. Default privileges are revoked first and every grant
-- below is intentional. The API roles get NO direct INSERT/UPDATE/DELETE on any table: writes go
-- only through the SECURITY DEFINER functions. RLS is a second layer, enabled on every table.
-- The table owner bypasses RLS (Supabase: functions and migrations run as postgres), which is why
-- the functions authorize explicitly and set search_path = ''.

-- ---------- Enable RLS everywhere ----------
alter table public.departments enable row level security;
alter table public.batches enable row level security;
alter table public.topics enable row level security;
alter table public.companies enable row level security;
alter table public.company_aliases enable row level security;
alter table public.profiles enable row level security;
alter table public.experiences enable row level security;
alter table public.experience_eligible_departments enable row level security;
alter table public.experience_resources enable row level security;
alter table public.rounds enable row level security;
alter table public.round_topics enable row level security;
alter table public.questions enable row level security;
alter table public.question_topics enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table private.profile_private enable row level security;
alter table private.settings enable row level security;
alter table private.usn_attempts enable row level security;
alter table private.deletion_ledger enable row level security;
alter table private.experience_authors enable row level security;
alter table private.usn_disputes enable row level security;
alter table private.admin_audit enable row level security;
alter table private.user_notices enable row level security;

-- ---------- Revoke everything from API roles, then grant back explicitly ----------
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

-- Policies call a few private helpers as the invoker, so those roles need schema USAGE and
-- EXECUTE on exactly those helpers. They get no table privileges in `private`.
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
-- Functions called inside an owner-rights view are permission-checked against the CALLER, not the
-- view owner (found by the database tests), so the staff views need this grant too.
grant execute on function private.is_staff() to authenticated;

-- ---------- Policies ----------
create policy departments_read on public.departments for select to anon, authenticated using (true);
create policy batches_read on public.batches for select to anon, authenticated using (true);
create policy topics_read on public.topics for select to anon, authenticated using (true);
create policy companies_read on public.companies for select to anon, authenticated using (true);
create policy company_aliases_read on public.company_aliases for select to anon, authenticated using (true);

create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_read_admin on public.profiles for select to authenticated using (private.is_admin());

-- Every other table has RLS enabled and NO policy, so API roles are denied by default.

-- ---------- Table grants (read-only, public reference data) ----------
grant select on public.departments, public.batches, public.topics, public.companies,
  public.company_aliases to anon, authenticated;
grant select on public.profiles to authenticated;

-- ---------- Views ----------
grant select on public.public_experiences, public.public_rounds, public.public_questions,
  public.public_resources, public.public_eligible_departments, public.company_stats
  to anon, authenticated;
grant select on public.my_experiences, public.my_moderation_feedback, public.my_reports,
  public.my_notices, public.moderation_experiences, public.moderation_reports,
  public.moderation_history to authenticated;

-- ---------- Functions ----------
-- Public read.
grant execute on function public.search_experiences(text, uuid, smallint, smallint,
  public.opportunity_type, public.result_type, public.round_type, integer, integer)
  to anon, authenticated;

-- Signed-in members. Each function re-checks identity and role itself.
grant execute on function
  public.complete_onboarding(smallint, smallint, text),
  public.get_my_usn(),
  public.save_draft(uuid, integer, jsonb),
  public.delete_draft(uuid),
  public.get_my_experience(uuid),
  public.submit_experience(uuid),
  public.withdraw_experience(uuid),
  public.report_experience(uuid, public.report_reason, text),
  public.mark_notice_read(uuid),
  public.request_account_deletion(),
  public.request_usn_review(text),
  public.object_to_usn_release(uuid),
  public.moderate_experience(uuid, text, public.reason_code, text),
  public.resolve_report(uuid, text, public.reason_code, boolean),
  public.moderation_experience_detail(uuid),
  public.admin_set_user_role(uuid, public.user_role, text),
  public.admin_correct_name(uuid, text, text),
  public.admin_reveal_author(uuid, text),
  public.admin_get_usn(uuid, text),
  public.admin_create_company(text, text, text),
  public.admin_add_company_alias(uuid, text, text),
  public.admin_list_audit(text, integer),
  public.admin_usn_case_take(uuid, boolean, text),
  public.admin_usn_case_notify(uuid, text),
  public.admin_usn_case_approve(uuid, text, text, text, boolean),
  public.admin_usn_case_deny(uuid, text),
  public.admin_usn_case_execute(uuid, text)
  to authenticated;

-- Server only (service role key, never in a browser bundle).
grant execute on function
  public.delete_account_data(uuid),
  public.purge_expired_drafts(integer),
  public.purge_deletion_ledger(integer)
  to service_role;

-- Auth hook: only the Auth service may call it.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
