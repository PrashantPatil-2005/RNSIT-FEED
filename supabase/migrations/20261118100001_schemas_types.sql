-- RNSIT FEED: schemas, extensions, enum types and default-privilege hardening.
--
-- STATUS: DRAFT, NOT APPLIED to any database. Proposed under the v1.2 change request,
-- which has not been accepted. See docs/DATABASE.md.
--
-- Supabase grants table, function and sequence privileges on new `public` objects to
-- anon, authenticated and service_role by default, and Postgres grants EXECUTE on new
-- functions to PUBLIC. This design never relies on those defaults: they are revoked first,
-- then each grant is written out explicitly in the last migration.

-- Remove default grants for objects this role creates from now on.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.opportunity_type as enum ('internship', 'full_time', 'both');
create type public.campus_type as enum ('on_campus', 'off_campus');
create type public.result_type as enum ('selected', 'rejected', 'waitlisted');
create type public.round_type as enum ('oa', 'technical', 'hr', 'gd', 'managerial');
create type public.exp_status as enum ('draft', 'pending', 'approved', 'rejected', 'removed', 'withdrawn');
create type public.user_role as enum ('student', 'alumni', 'moderator', 'admin');
create type public.report_reason as enum ('nda', 'personal_info', 'defamation', 'spam', 'fake', 'other');
create type public.report_status as enum ('open', 'actioned', 'dismissed', 'moot');
create type public.reason_code as enum ('nda', 'personal_info', 'defamation', 'low_quality', 'duplicate', 'other');
-- cancel_submission is intentionally absent: it is an unapproved proposal (see docs/decisions).
create type public.mod_action as enum (
  'submit', 'resubmit', 'approve', 'reject', 'remove', 'restore', 'withdraw',
  'resolve_report', 'dismiss_report'
);
create type public.admin_action as enum (
  'bootstrap_admin', 'set_role', 'correct_name', 'reveal_author', 'view_usn', 'view_audit',
  'manage_company', 'take_usn_case', 'notify_usn_holder', 'approve_usn_case',
  'deny_usn_case', 'execute_usn_release'
);
create type public.usn_case_state as enum (
  'opened', 'under_review', 'notice_sent', 'contested', 'approved', 'denied', 'executed', 'closed'
);
create type public.notice_kind as enum ('usn_dispute_opened', 'usn_released');
