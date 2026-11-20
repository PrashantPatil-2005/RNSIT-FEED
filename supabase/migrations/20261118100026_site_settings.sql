-- Site settings from the admin panel (owner request 2026-11-20, admin panel plan step C9).
--
-- Admins change an allowlisted set of keys in private.settings through one audited function:
--   signups_open          'true' | 'false'  new accounts may be created (the owner always may)
--   posting_open          'true' | 'false'  members may submit experiences (admins always may)
--   comments_open         'true' | 'false'  members may comment (moderators and admins always may)
--   site_notice           0-280 characters  shown in the site-wide banner; empty removes it
--   alumni_invite_days    1-365             how long an alumni invite stays open
--   allowed_email_domain  a domain          owner only once an owner is configured; new sign-ups only
-- A missing switch counts as open, so behaviour is unchanged until an admin closes one.
-- The switches are enforced by triggers in the database, not only in the UI.

-- ---------- Helpers (no grants) ----------

create function private.setting_on(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value <> 'false' from private.settings s where s.key = p_key), true)
$$;

-- ---------- Public read for the banner and forms ----------

create function public.site_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'notice', (select nullif(btrim(s.value), '') from private.settings s where s.key = 'site_notice'),
    'signups_open', private.setting_on('signups_open'),
    'posting_open', private.setting_on('posting_open'),
    'comments_open', private.setting_on('comments_open')
  )
$$;

-- ---------- Admin read and write ----------

create function public.admin_list_settings()
returns table (key text, value text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select s.key, s.value from private.settings s
  where s.key in ('signups_open', 'posting_open', 'comments_open', 'site_notice',
                  'alumni_invite_days', 'allowed_email_domain')
  order by s.key;
end $$;

create function public.admin_set_setting(p_key text, p_value text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_value text := btrim(coalesce(p_value, ''));
  v_evidence text;
begin
  if p_key in ('signups_open', 'posting_open', 'comments_open') then
    v_value := lower(v_value);
    if v_value not in ('true', 'false') then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_evidence := 'setting:' || p_key || '=' || v_value;
  elsif p_key = 'site_notice' then
    if length(v_value) > 280 or v_value ~ '[[:cntrl:]]' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    -- The notice text itself is not copied into the audit log.
    v_evidence := 'setting:site_notice' || case when v_value = '' then '=cleared' else '' end;
  elsif p_key = 'alumni_invite_days' then
    if v_value !~ '^[1-9][0-9]{0,2}$' or v_value::integer > 365 then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_evidence := 'setting:alumni_invite_days=' || v_value;
  elsif p_key = 'allowed_email_domain' then
    if private.owner_email() is not null and not private.is_owner(v_uid) then
      raise exception 'owner_only' using errcode = '42501';
    end if;
    v_value := ltrim(lower(v_value), '@');
    if length(v_value) > 253
       or v_value !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_evidence := 'setting:allowed_email_domain=' || v_value;
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  perform private.log_admin('change_setting', v_uid, null, null, null, p_reason, null, v_evidence);
  if p_key = 'site_notice' and v_value = '' then
    delete from private.settings where key = 'site_notice';
  else
    insert into private.settings (key, value) values (p_key, v_value)
    on conflict (key) do update set value = excluded.value;
  end if;
end $$;

-- ---------- Enforcement ----------

-- Runs alongside auth_users_guard. The owner can always sign up, so a closed switch cannot lock
-- the owner out after an account deletion.
create function private.auth_users_signups_open()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.setting_on('signups_open')
     and lower(btrim(coalesce(new.email, ''))) is distinct from private.owner_email() then
    raise exception 'signups_paused' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger auth_users_signups_open before insert on auth.users
  for each row execute function private.auth_users_signups_open();

-- Submitting (draft or returned -> pending) is paused for members; admins may still submit.
create function private.experiences_posting_open()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' and old.status is distinct from 'pending'
     and not private.setting_on('posting_open') and not private.is_admin() then
    raise exception 'posting_paused' using errcode = '55000';
  end if;
  return new;
end $$;

create trigger experiences_posting_open before update of status on public.experiences
  for each row execute function private.experiences_posting_open();

-- New comments are paused for members; moderators and admins may still comment.
create function private.comments_open_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.setting_on('comments_open') and not private.is_staff() then
    raise exception 'comments_paused' using errcode = '55000';
  end if;
  return new;
end $$;

create trigger comments_open_guard before insert on public.comments
  for each row execute function private.comments_open_guard();

-- ---------- Grants ----------

revoke execute on function private.setting_on(text) from public, anon, authenticated;
revoke execute on function private.auth_users_signups_open() from public, anon, authenticated;
revoke execute on function private.experiences_posting_open() from public, anon, authenticated;
revoke execute on function private.comments_open_guard() from public, anon, authenticated;
revoke execute on function public.site_status() from public;
revoke execute on function public.admin_list_settings() from public, anon;
revoke execute on function public.admin_set_setting(text, text, text) from public, anon;
grant execute on function public.site_status() to anon, authenticated;
grant execute on function public.admin_list_settings() to authenticated;
grant execute on function public.admin_set_setting(text, text, text) to authenticated;
