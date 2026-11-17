-- SECURITY FIX found by the real-Supabase validation (2026-11-17).
--
-- Problem: the sign-up trigger and the Auth hook accepted user_metadata.email_verified = true as
-- proof of a verified email. user_metadata is CLIENT-CONTROLLED at sign-up (supabase.auth.signUp
-- `options.data`), so anyone could register an address on the college domain they do not own.
-- Reproduced locally: email/password sign-up with data {email_verified: true} was accepted and
-- could sign in.
--
-- Fix: verification must come from something the client cannot set:
--   * email_confirmed_at already set on the inserted row (direct, privileged inserts only), or
--   * app_metadata.provider = 'google' (written by the Auth server, never by the client) AND the
--     Google-provided email_verified claim is true.
-- Email/password and magic-link sign-ups are therefore refused; the approved policy is Google
-- sign-in only (v1.1 Section 4).
--
-- UNVERIFIED: the exact insert-time shape of a real Google sign-up (app_metadata.provider and
-- user_metadata.email_verified) has not been observed, because local testing has no Google OAuth
-- client. If it differs, Google sign-up fails CLOSED and must be re-checked in the development
-- project before beta.

create or replace function private.google_verified(p_app_meta jsonb, p_user_meta jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_app_meta ->> 'provider', '') = 'google'
     and lower(coalesce(p_user_meta ->> 'email_verified', '')) = 'true'
$$;

create or replace function private.auth_users_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.signup_allowed(
    new.email,
    (new.email_confirmed_at is not null)
      or private.google_verified(new.raw_app_meta_data, new.raw_user_meta_data)
  ) then
    raise exception 'signup_not_allowed' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if private.signup_allowed(
    event -> 'user' ->> 'email',
    private.google_verified(event -> 'user' -> 'app_metadata', event -> 'user' -> 'user_metadata')
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'message', 'Sign-up is not allowed for this email address.', 'http_code', 403));
end $$;

revoke execute on function private.google_verified(jsonb, jsonb) from public, anon, authenticated;
