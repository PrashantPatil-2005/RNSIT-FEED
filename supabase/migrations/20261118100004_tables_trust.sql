-- Reports, audit logs, USN disputes, notices.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason public.report_reason not null,
  details text check (details is null or length(details) <= 1000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reports_one_per_user unique (experience_id, reporter_id)
);
create index reports_queue_idx on public.reports (status, created_at);

-- Moderator-visible history. No free text, no admin-only events, no author identity.
-- Foreign keys use ON DELETE SET NULL so deleting a user or post leaves no identifier behind.
create table public.moderation_actions (
  id bigint generated always as identity primary key,
  action public.mod_action not null,
  experience_id uuid references public.experiences (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text not null check (actor_role in ('author', 'moderator', 'admin')),
  reason_code public.reason_code,
  created_at timestamptz not null default now(),
  constraint moderation_reject_needs_reason
    check (action not in ('reject', 'remove') or reason_code is not null)
);
create index moderation_actions_experience_idx on public.moderation_actions (experience_id);
create index moderation_actions_created_idx on public.moderation_actions (created_at);

-- USN ownership disputes (decision U10).
create table private.usn_disputes (
  id uuid primary key default gen_random_uuid(),
  claimant_id uuid not null references public.profiles (id) on delete cascade,
  claimed_usn text not null check (claimed_usn ~ '^1RN[0-9]{2}[A-Z]{2}[0-9]{3}$'),
  holder_id uuid references public.profiles (id) on delete set null,
  state public.usn_case_state not null default 'opened',
  reviewer_id uuid references public.profiles (id) on delete set null,
  conflict_attested boolean,
  verification_method text check (verification_method is null or length(verification_method) between 3 and 200),
  evidence_ref text check (evidence_ref is null or length(evidence_ref) between 3 and 200),
  opened_at timestamptz not null default now(),
  notice_sent_at timestamptz,
  notice_deadline timestamptz,
  contested_at timestamptz,
  decided_at timestamptz,
  executed_at timestamptz
);
-- At most one live case per claimant and per claimed USN.
create unique index usn_disputes_one_open_per_claimant on private.usn_disputes (claimant_id)
  where state in ('opened', 'under_review', 'notice_sent', 'contested', 'approved');
create unique index usn_disputes_one_open_per_usn on private.usn_disputes (claimed_usn)
  where state in ('opened', 'under_review', 'notice_sent', 'contested', 'approved');
create index usn_disputes_state_idx on private.usn_disputes (state);

-- Admin-only audit. Moderators have no access path to this table.
create table private.admin_audit (
  id bigint generated always as identity primary key,
  action public.admin_action not null,
  actor_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  experience_id uuid references public.experiences (id) on delete set null,
  case_id uuid references private.usn_disputes (id) on delete set null,
  -- Must not contain names, USNs or evidence details (use opaque references). Not machine-checkable.
  reason text not null check (length(reason) between 10 and 1000),
  verification_method text,
  evidence_ref text,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on private.admin_audit (created_at);

-- In-app notices with fixed templates and no free text. Email is not relied on.
create table private.user_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notice_kind not null,
  ref_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index user_notices_user_idx on private.user_notices (user_id, created_at);
