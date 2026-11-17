-- Placement experiences, rounds, questions, resources.
-- experiences has NO author column: the author link lives in private.experience_authors.

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete restrict,
  role_title text check (role_title is null or length(btrim(role_title)) between 2 and 120),
  opportunity_type public.opportunity_type,
  campus_type public.campus_type,
  department_id smallint not null references public.departments (id) on delete restrict,
  batch_id smallint not null references public.batches (id) on delete restrict,
  recruitment_year smallint check (recruitment_year is null or recruitment_year between 2000 and 2100),
  min_cgpa numeric(3, 1) check (min_cgpa is null or (min_cgpa >= 0 and min_cgpa <= 10)),
  backlogs_allowed smallint check (backlogs_allowed is null or backlogs_allowed >= 0),
  result public.result_type,
  prep_tips text check (prep_tips is null or length(prep_tips) <= 5000),
  -- No default: the author must choose. May stay NULL only while draft or rejected.
  is_anonymous boolean,
  status public.exp_status not null default 'draft',
  row_version integer not null default 0,
  moderation_note text check (moderation_note is null or length(moderation_note) <= 1000),
  search_doc tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  withdrawn_at timestamptz,
  constraint experiences_complete_when_live check (
    status in ('draft', 'rejected')
    or (company_id is not null and role_title is not null and opportunity_type is not null
        and campus_type is not null and recruitment_year is not null and result is not null
        and is_anonymous is not null)
  )
);
create index experiences_feed_idx on public.experiences (status, approved_at desc);
create index experiences_company_idx on public.experiences (company_id, status);
create index experiences_filter_idx on public.experiences (status, department_id, batch_id, opportunity_type, result);
create index experiences_search_idx on public.experiences using gin (search_doc);

-- The protected identity mapping (finding C1).
create table private.experience_authors (
  experience_id uuid primary key references public.experiences (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict
);
create index experience_authors_author_idx on private.experience_authors (author_id);

create table public.experience_eligible_departments (
  experience_id uuid not null references public.experiences (id) on delete cascade,
  department_id smallint not null references public.departments (id) on delete restrict,
  primary key (experience_id, department_id)
);

create table public.experience_resources (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  position smallint not null check (position between 1 and 10),
  url text not null check (url ~* '^https?://[^[:space:]]+$' and length(url) <= 2048),
  label text check (label is null or length(label) <= 120),
  constraint experience_resources_position_key unique (experience_id, position) deferrable initially deferred
);

-- Rounds and questions are separate entities (confirmed decision).
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  position smallint not null check (position between 1 and 12),
  round_type public.round_type not null,
  duration_min smallint check (duration_min is null or duration_min between 1 and 600),
  platform text check (platform is null or length(platform) <= 120),
  difficulty smallint check (difficulty is null or difficulty between 1 and 5),
  notes text check (notes is null or length(notes) <= 2000),
  constraint rounds_position_key unique (experience_id, position) deferrable initially deferred
);
create index rounds_type_idx on public.rounds (round_type);

create table public.round_topics (
  round_id uuid not null references public.rounds (id) on delete cascade,
  topic_id smallint not null references public.topics (id) on delete restrict,
  primary key (round_id, topic_id)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  -- The author's own words only. Never question papers or screenshots.
  body text not null check (length(btrim(body)) between 10 and 2000),
  constraint questions_position_key unique (round_id, position) deferrable initially deferred
);
create index questions_round_idx on public.questions (round_id);

create table public.question_topics (
  question_id uuid not null references public.questions (id) on delete cascade,
  topic_id smallint not null references public.topics (id) on delete restrict,
  primary key (question_id, topic_id)
);
