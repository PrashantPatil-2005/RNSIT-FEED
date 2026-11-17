-- Lookups, companies, profiles and private identity data.

create table public.departments (
  id smallint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z]{2}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  active boolean not null default true
);

create table public.batches (
  id smallint generated always as identity primary key,
  grad_year smallint not null unique check (grad_year between 2000 and 2100)
);

create table public.topics (
  id smallint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (length(btrim(name)) between 2 and 80)
);

-- Company management is admin-only in the MVP (decision U14).
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  created_at timestamptz not null default now()
);
create unique index companies_name_lower_key on public.companies (lower(name));
create index companies_name_trgm on public.companies using gin (lower(name) extensions.gin_trgm_ops);

create table public.company_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  alias text not null check (length(btrim(alias)) between 1 and 120)
);
create unique index company_aliases_alias_lower_key on public.company_aliases (lower(alias));
create index company_aliases_company_idx on public.company_aliases (company_id);
create index company_aliases_alias_trgm on public.company_aliases using gin (lower(alias) extensions.gin_trgm_ops);

-- "domain_verified" means only: signed in with a Google account on the allowed domain.
-- It does not prove enrollment, student status or alumni status.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  department_id smallint references public.departments (id) on delete restrict,
  batch_id smallint references public.batches (id) on delete restrict,
  role public.user_role not null default 'student',
  domain_verified boolean not null default false,
  onboarded_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profiles_onboarded_needs_dept_batch
    check (onboarded_at is null or (department_id is not null and batch_id is not null))
);
create index profiles_role_idx on public.profiles (role);

-- USN: uppercase TEXT, unique, private. Never identity proof.
-- Numbering scope of the serial (global / per department / per year) is NOT assumed.
create table private.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  usn text not null unique check (usn ~ '^1RN[0-9]{2}[A-Z]{2}[0-9]{3}$'),
  updated_at timestamptz not null default now()
);

create table private.settings (
  key text primary key,
  value text not null
);

-- Failed or repeated USN claims, for rate limiting only. Holds no USN value.
create table private.usn_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index usn_attempts_user_time_idx on private.usn_attempts (user_id, attempted_at);

-- Lets a restore replay deletions. user id and date only; purged after 30 days (decision U15).
create table private.deletion_ledger (
  user_id uuid primary key,
  deleted_at timestamptz not null default now()
);
