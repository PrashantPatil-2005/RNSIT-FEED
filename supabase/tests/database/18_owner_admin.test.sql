-- Owner admin (migration 024): the configured owner address becomes admin at sign-up, the owner's
-- role cannot be changed, and only the owner manages admins. No owner setting = old behaviour.
begin;

-- Without an owner setting nothing changes: admin_x may still manage admin_y
do $$
begin
  perform test.assert(private.owner_email() is null, 'no owner configured in the synthetic seed');
  perform test.assert(not private.is_owner(test.admin_x()), 'nobody is owner without the setting');
  perform test.as_user(test.admin_x());
  perform test.assert(public.admin_owner_id() is null, 'no owner id without the setting');
  perform test.reset();
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L::uuid, 'student', 'short') $f$, test.admin_y()), 'reason_required');
  perform test.reset();
end $$;

-- Helpers are internal only
do $$
begin
  perform test.as_user(test.alice());
  perform test.expect_error($f$ select private.owner_email() $f$, 'permission denied');
  perform test.expect_error(format($f$ select private.is_owner(%L::uuid) $f$, test.alice()), 'permission denied');
  perform test.reset();
end $$;

-- The owner signs up and is admin at once, audited and in role history, even past the 2-admin cap
do $$
declare
  v_owner uuid := 'c0000000-0000-4000-8000-000000000001';
  v_audit integer := (select count(*) from private.admin_audit where action = 'owner_auto_admin');
begin
  insert into private.settings (key, value) values ('owner_email', '  Synthetic.Owner@EXAMPLE.test ');
  perform test.assert((select count(*) from public.profiles where role = 'admin') = 2, 'seed already has two admins');

  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (v_owner, 'synthetic.owner@example.test', now(), '{"full_name":"Synthetic Owner"}');

  perform test.assert((select role from public.profiles where id = v_owner) = 'admin', 'owner is admin at sign-up');
  perform test.assert(private.is_owner(v_owner), 'owner recognised, case and spaces ignored');
  perform test.as_user(test.admin_x());
  perform test.assert(public.admin_owner_id() = v_owner, 'admins can see who the owner is');
  perform test.reset();
  perform test.as_user(test.alice());
  perform test.expect_error($f$ select public.admin_owner_id() $f$, 'forbidden');
  perform test.reset();
  perform test.assert((select count(*) from private.admin_audit where action = 'owner_auto_admin') = v_audit + 1, 'auto admin audited');
  perform test.assert(exists (
    select 1 from private.role_changes c
    where c.user_id = v_owner and c.old_role = 'student' and c.new_role = 'admin' and c.changed_by is null
  ), 'role history records the automatic change');

  -- Other new accounts are still students
  insert into auth.users (id, email, email_confirmed_at)
  values ('c0000000-0000-4000-8000-000000000002', 'synthetic.notowner@example.test', now());
  perform test.assert((select role from public.profiles where id = 'c0000000-0000-4000-8000-000000000002') = 'student', 'other sign-ups stay students');
end $$;

-- An owner address outside the allowed domain gets no admin role (and normally cannot sign up at all)
do $$
begin
  update private.settings set value = 'synthetic.owner@other.test' where key = 'owner_email';
  perform test.expect_error($f$ insert into auth.users (email, email_confirmed_at) values ('synthetic.owner@other.test', now()) $f$, 'signup_not_allowed');
  update private.settings set value = 'synthetic.owner@example.test' where key = 'owner_email';
end $$;

-- Other admins cannot touch the owner, and cannot appoint or remove admins
do $$
declare v_owner uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L::uuid, 'student', 'Synthetic demotion attempt') $f$, v_owner), 'owner_protected');
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L::uuid, 'student', 'Synthetic demotion attempt') $f$, test.admin_y()), 'owner_only');
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L::uuid, 'admin', 'Synthetic promotion attempt') $f$, test.alice()), 'owner_only');
  -- Non-admin role changes still work for other admins
  perform public.admin_set_user_role(test.bob(), 'moderator', 'Synthetic moderator appointment');
  perform test.reset();
  perform test.assert((select role from public.profiles where id = v_owner) = 'admin', 'owner still admin');
  perform test.assert((select role from public.profiles where id = test.admin_y()) = 'admin', 'admin_y still admin');
  perform test.assert((select role from public.profiles where id = test.bob()) = 'moderator', 'other admins can still appoint moderators');
end $$;

-- The owner manages admins (cap of two still applies to appointments)
do $$
declare v_owner uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  perform test.as_user(v_owner);
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L::uuid, 'moderator', 'Synthetic pre-onboarding attempt') $f$, test.alice()), 'onboarding_required');
  perform test.reset();
  perform test.as_user(v_owner);
  perform public.complete_onboarding(2::smallint, 1::smallint, '1RN00ZZ091');
  perform test.reset();
  perform test.as_user(v_owner);
  perform public.admin_set_user_role(test.admin_y(), 'student', 'Synthetic owner removes an admin');
  perform public.admin_set_user_role(test.admin_x(), 'student', 'Synthetic owner removes an admin');
  perform public.admin_set_user_role(test.alice(), 'admin', 'Synthetic owner appoints an admin');
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L::uuid, 'admin', 'Synthetic owner appoints an admin') $f$, test.admin_x()), 'limit_reached');
  perform test.expect_error(format($f$ select public.admin_set_user_role(%L::uuid, 'student', 'Synthetic self demotion') $f$, v_owner), 'forbidden');
  perform test.reset();
  perform test.assert((select role from public.profiles where id = test.alice()) = 'admin', 'owner appointed an admin');
  perform test.assert((select role from public.profiles where id = test.admin_y()) = 'student', 'owner removed an admin');
end $$;

rollback;
