-- Owner admin (owner request 2026-11-20, admin panel plan step A).
--
-- * private.settings key 'owner_email' names the project owner's college address. The value is set
--   per environment with SQL and is never written in a migration, because this repo is public.
-- * When that address signs up it becomes 'admin' straight away (audited as owner_auto_admin and
--   recorded in role_changes). This survives the owner deleting and re-creating their account, so
--   no manual bootstrap_admin is needed. The owner is always admin, so the two-admin cap does not
--   apply to this step.
-- * Owner protection: nobody can change the owner's role, and once an owner is configured only the
--   owner can appoint or remove other admins.
-- * With no 'owner_email' setting every rule below is switched off and behaviour is unchanged.

-- ---------- Helpers (no grants) ----------

create function private.owner_email()
returns text language sql stable security definer set search_path = '' as $$
  select nullif(lower(btrim(s.value)), '')
  from private.settings s where s.key = 'owner_email'
$$;

create function private.is_owner(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (
    select 1 from auth.users u
    where u.id = p_user and lower(btrim(u.email)) = private.owner_email()
  )
$$;

-- ---------- Sign-up (replaces the migration 016 body; same rules plus the owner step) ----------

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_invite uuid;
  v_owner boolean;
begin
  -- The owner must still pass the normal domain check (auth_users_guard runs before this).
  v_owner := v_email <> '' and v_email = private.owner_email()
             and split_part(v_email, '@', 2) = private.allowed_domain();
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
  if v_owner then
    perform private.log_admin('owner_auto_admin', null, new.id, null, null,
      'Owner account signed up; admin role assigned automatically');
    perform private.apply_role_change(new.id, 'admin', null);
  end if;
  return new;
end $$;

-- ---------- Role changes (replaces the migration 019 body; adds owner protection) ----------

create or replace function public.admin_set_user_role(p_user uuid, p_role public.user_role, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_old public.user_role;
  v_admins integer;
begin
  if p_user = v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
  select p.role into v_old from public.profiles p where p.id = p_user and p.deletion_requested_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if private.is_owner(p_user) then
    raise exception 'owner_protected' using errcode = '42501';
  end if;
  if private.owner_email() is not null and not private.is_owner(v_uid)
     and (p_role = 'admin' or v_old = 'admin') then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  select count(*) into v_admins from public.profiles p where p.role = 'admin' and p.deletion_requested_at is null;
  if p_role = 'admin' and v_old <> 'admin' and v_admins >= 2 then
    raise exception 'limit_reached' using errcode = '53400';
  end if;
  if v_old = 'admin' and p_role <> 'admin' and v_admins <= 1 then
    raise exception 'last_admin' using errcode = '55000';
  end if;
  perform private.log_admin('set_role', v_uid, p_user, null, null, p_reason);
  perform private.apply_role_change(p_user, p_role, v_uid);
end $$;

revoke execute on function private.owner_email() from public, anon, authenticated;
revoke execute on function private.is_owner(uuid) from public, anon, authenticated;

-- ---------- Read for the admin users page ----------

-- The owner's profile id, or null when no owner is configured or they have no account. Admins only.
-- Lets the users page mark the owner and hide controls the database would refuse anyway.
create function public.admin_owner_id()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return (
    select p.id from public.profiles p join auth.users u on u.id = p.id
    where lower(btrim(u.email)) = private.owner_email()
    limit 1
  );
end $$;

revoke execute on function public.admin_owner_id() from public, anon;
grant execute on function public.admin_owner_id() to authenticated;
