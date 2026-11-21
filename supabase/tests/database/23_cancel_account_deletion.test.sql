-- Cancelling your own account-deletion request (migration 20261120130000).
begin;

do $$
begin
  -- Nothing to cancel
  perform test.as_user(test.alice());
  perform test.assert(not public.my_deletion_cancellable(), 'no pending deletion: not cancellable');
  perform test.expect_error($f$ select public.cancel_account_deletion() $f$, 'invalid_state');

  -- Own request: locked, then cancelled, then a member again
  perform public.request_account_deletion();
  perform test.expect_error($f$ select public.save_draft(null, null, '{}'::jsonb) $f$, 'forbidden');
  perform test.assert(public.my_deletion_cancellable(), 'own request is cancellable');
  perform public.cancel_account_deletion();
  perform test.assert(not public.my_deletion_cancellable(), 'nothing pending after cancel');
  perform public.save_draft(null, null, '{"role_title":"Synthetic after cancel"}'::jsonb);
  perform test.reset();
  perform test.assert(
    (select deletion_requested_at is null from public.profiles where id = test.alice()),
    'deletion flag cleared'
  );

  -- Columns stay protected outside the function
  perform test.as_user(test.alice());
  perform public.request_account_deletion();
  perform test.expect_error(
    format($f$ update public.profiles set deletion_requested_at = null where id = %L $f$, test.alice()),
    'permission denied'
  );
  perform test.reset();

  -- Maintenance refuses an account whose request was cancelled
  perform test.as_user(test.alice());
  perform public.cancel_account_deletion();
  perform test.reset();
  perform test.expect_error(format($f$ select public.delete_account_data(%L) $f$, test.alice()), 'deletion_not_requested');

  -- A deletion forced by an admin cannot be undone by the member
  perform test.as_user(test.admin_x());
  perform public.admin_request_user_deletion(test.bob(), 'Synthetic forced deletion');
  perform test.reset();
  perform test.as_user(test.bob());
  perform test.assert(not public.my_deletion_cancellable(), 'forced deletion is not cancellable');
  perform test.expect_error($f$ select public.cancel_account_deletion() $f$, 'admin_requested');
  perform test.reset();
  perform test.assert(
    (select deletion_requested_at is not null from public.profiles where id = test.bob()),
    'forced deletion still pending'
  );
end $$;

rollback;
