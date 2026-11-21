-- Lets a member take back their own account-deletion request before the daily clean-up runs.
--
-- * Only the member's OWN request can be cancelled. A deletion an admin forced
--   (admin_request_user_deletion, audited with evidence_ref 'force_delete') stays locked.
-- * Cannot use private.require_member(): it refuses accounts with a pending deletion by design.
-- * Suspension is separate and unaffected: a suspended member who cancels stays suspended.

-- True when the caller has a pending deletion that they asked for themselves.
create function public.my_deletion_cancellable()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.deletion_requested_at is not null
      and not exists (
        select 1 from private.admin_audit a
        where a.target_user_id = p.id
          and a.action = 'manage_user'
          and a.evidence_ref = 'force_delete'
          and a.created_at >= p.deletion_requested_at
      )
  );
$$;

create function public.cancel_account_deletion()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.deletion_requested_at is not null) then
    raise exception 'invalid_state' using errcode = '55000';
  end if;
  if not public.my_deletion_cancellable() then
    raise exception 'admin_requested' using errcode = '42501';
  end if;
  perform set_config('app.profile_change', '1', true);
  update public.profiles p set deletion_requested_at = null where p.id = v_uid;
  perform set_config('app.profile_change', '', true);
end $$;

revoke execute on function public.my_deletion_cancellable() from public, anon;
revoke execute on function public.cancel_account_deletion() from public, anon;
grant execute on function public.my_deletion_cancellable() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;
