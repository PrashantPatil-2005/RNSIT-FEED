-- Alumni invites (owner decision U3, 2026-11-17).
--
-- Members sign up with a Google-verified address on the allowed college domain (U1/U2: the owner
-- confirmed rnsit.ac.in; the value is set per environment in private.settings, never here).
-- Alumni who no longer have a college account can join only through an admin invite for their
-- exact email address. Every other address stays refused.
--
-- Rules:
--   * Still Google-verified only (migration 011). An invite never bypasses verification.
--   * Still fails closed: with no allowed domain configured, nobody can sign up, invited or not.
--   * Single use. The account is created with role 'alumni' and the invite is marked used.
--   * Open invites expire after private.settings 'alumni_invite_days' (default 14).
--   * The email is kept only while the invite is open; it is cleared on use, revoke or purge.
--   * The admin audit log references the invite id, never the email (O-3).
--
-- Verified 2026-11-17 with a real Google sign-in on the local stack: Google sign-ups arrive with
-- app_metadata.provider = 'google' and user_metadata.email_verified = true, as migration 011 assumed.

create table private.alumni_invites (
  id uuid primary key default gen_random_uuid(),
  email text check (
    email is null or (email = lower(btrim(email))
      and length(email) <= 254
      and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  constraint alumni_invites_one_outcome check (used_at is null or revoked_at is null),
  constraint alumni_invites_email_cleared check (
    (used_at is null and revoked_at is null) or email is null)
);
create unique index alumni_invites_one_open_per_email on private.alumni_invites (email)
  where email is not null and used_at is null and revoked_at is null;

alter table private.alumni_invites enable row level security;
revoke all on private.alumni_invites from public, anon, authenticated;

create function private.allowed_domain()
returns text language sql stable security definer set search_path = '' as $$
  select nullif(ltrim(lower(btrim(s.value)), '@'), '')
  from private.settings s where s.key = 'allowed_email_domain'
$$;

create function private.open_alumni_invite(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select i.id from private.alumni_invites i
  where i.email = lower(btrim(p_email))
    and i.used_at is null and i.revoked_at is null and i.expires_at > now()
$$;

create or replace function private.signup_allowed(p_email text, p_verified boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_domain text := private.allowed_domain();
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_domain is null then return false; end if;
  if not coalesce(p_verified, false) then return false; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then return false; end if;
  if split_part(v_email, '@', 2) = v_domain then return true; end if;
  return private.open_alumni_invite(v_email) is not null;
end $$;

-- Same as migration 005, plus: an account created through an invite is 'alumni' and uses it up.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_invite uuid;
begin
  if split_part(v_email, '@', 2) is distinct from private.allowed_domain() then
    select i.id into v_invite from private.alumni_invites i
    where i.email = v_email and i.used_at is null and i.revoked_at is null and i.expires_at > now()
    for update;
  end if;
  insert into public.profiles (id, full_name, domain_verified, role)
  values (
    new.id,
    left(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      'RNSIT member'
    ), 120),
    true,
    case when v_invite is null then 'student' else 'alumni' end::public.user_role
  );
  if v_invite is not null then
    update private.alumni_invites
    set used_at = now(), used_by = new.id, email = null
    where id = v_invite;
  end if;
  return new;
end $$;

comment on column public.profiles.domain_verified is
  'Eligible member: Google-verified on the allowed domain, or through a single-use alumni invite.';

create function public.admin_invite_alumnus(p_email text, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_days integer;
  v_id uuid;
begin
  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  -- The audit reason must not carry the address (O-3: no personal data in audit text).
  if position('@' in coalesce(p_reason, '')) > 0 then
    raise exception 'reason_has_email' using errcode = '22023';
  end if;
  if split_part(v_email, '@', 2) = private.allowed_domain() then
    raise exception 'not_needed' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'already_registered' using errcode = '23505';
  end if;
  -- An expired invite for the same address frees the slot (and drops its stored email).
  update private.alumni_invites set email = null
  where email = v_email and used_at is null and revoked_at is null and expires_at <= now();
  if private.open_alumni_invite(v_email) is not null then
    raise exception 'already_invited' using errcode = '23505';
  end if;

  v_days := coalesce((
    select s.value::integer from private.settings s
    where s.key = 'alumni_invite_days' and s.value ~ '^[1-9][0-9]{0,2}$'), 14);
  insert into private.alumni_invites (email, invited_by, expires_at)
  values (v_email, v_uid, now() + make_interval(days => v_days))
  returning id into v_id;
  perform private.log_admin('invite_alumnus', v_uid, null, null, null, p_reason, null,
    'alumni_invite:' || v_id);
  return v_id;
end $$;

create function public.admin_revoke_alumni_invite(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_admin();
begin
  if position('@' in coalesce(p_reason, '')) > 0 then
    raise exception 'reason_has_email' using errcode = '22023';
  end if;
  update private.alumni_invites
  set revoked_at = now(), revoked_by = v_uid, email = null
  where id = p_id and used_at is null and revoked_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.log_admin('revoke_alumni_invite', v_uid, null, null, null, p_reason, null,
    'alumni_invite:' || p_id);
end $$;

-- Masked addresses only: enough to tell invites apart without exposing them in the admin UI.
create function public.admin_list_alumni_invites()
returns table (
  id uuid, email_masked text, status text, created_at timestamptz, expires_at timestamptz,
  used_at timestamptz, revoked_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select i.id,
         case when i.email is null then null
              else left(split_part(i.email, '@', 1), 1) || '***@' || split_part(i.email, '@', 2) end,
         case when i.used_at is not null then 'used'
              when i.revoked_at is not null then 'revoked'
              when i.expires_at <= now() then 'expired'
              else 'open' end,
         i.created_at, i.expires_at, i.used_at, i.revoked_at
  from private.alumni_invites i
  order by i.created_at desc
  limit 200;
end $$;

-- Scheduled cleanup: expired invites keep no email.
create function public.purge_expired_alumni_invites()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  update private.alumni_invites set email = null
  where email is not null and used_at is null and revoked_at is null and expires_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------- Grants ----------
revoke execute on function private.allowed_domain() from public, anon, authenticated;
revoke execute on function private.open_alumni_invite(text) from public, anon, authenticated;
revoke execute on function public.admin_invite_alumnus(text, text) from public, anon, authenticated;
revoke execute on function public.admin_revoke_alumni_invite(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_list_alumni_invites() from public, anon, authenticated;
revoke execute on function public.purge_expired_alumni_invites() from public, anon, authenticated;

grant execute on function public.admin_invite_alumnus(text, text) to authenticated;
grant execute on function public.admin_revoke_alumni_invite(uuid, text) to authenticated;
grant execute on function public.admin_list_alumni_invites() to authenticated;
grant execute on function public.purge_expired_alumni_invites() to service_role;
