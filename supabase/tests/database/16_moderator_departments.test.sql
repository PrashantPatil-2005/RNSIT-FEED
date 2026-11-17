-- Moderator departments, role history and stepping down (plan P2; decisions D-R2 to D-R6).
begin;

-- Only admins can assign, unassign, view coverage or role history; nobody reads the tables directly
do $$
declare v_uid uuid;
begin
  perform test.as_anon();
  perform test.expect_error($f$ select public.admin_assign_moderator_department(test.moderator(), 1::smallint, 'Synthetic department assignment') $f$, 'permission denied');
  perform test.expect_error($f$ select public.moderator_step_down('Synthetic step down reason') $f$, 'permission denied');
  perform test.expect_error($f$ select * from public.my_moderator_departments() $f$, 'permission denied');
  perform test.reset();
  foreach v_uid in array array[test.alice(), test.moderator()] loop
    perform test.as_user(v_uid);
    perform test.expect_error($f$ select public.admin_assign_moderator_department(test.moderator(), 1::smallint, 'Synthetic department assignment') $f$, 'forbidden');
    perform test.expect_error($f$ select public.admin_unassign_moderator_department(test.moderator(), 1::smallint, 'Synthetic department removal') $f$, 'forbidden');
    perform test.expect_error($f$ select * from public.admin_moderator_coverage() $f$, 'forbidden');
    perform test.expect_error($f$ select * from public.admin_user_role_history(test.alice()) $f$, 'forbidden');
    perform test.expect_error($f$ select * from private.moderator_departments $f$, 'permission denied');
    perform test.expect_error($f$ select * from private.role_changes $f$, 'permission denied');
    perform test.reset();
  end loop;
  perform test.assert(not exists (select 1 from private.moderator_departments), 'refused calls assigned nothing');
end $$;

-- The seed appointment through admin_set_user_role was recorded in the role history
do $$
begin
  perform test.assert(exists (
    select 1 from private.role_changes
    where user_id = test.moderator() and old_role = 'student' and new_role = 'moderator' and changed_by = test.admin_x()
  ), 'seed promotion recorded student -> moderator by admin_x');
  perform test.expect_error($f$ update private.role_changes set new_role = 'admin' $f$, 'audit_immutable');
  perform test.expect_error($f$ delete from private.role_changes $f$, 'audit_immutable');
  perform test.expect_error($f$ truncate private.role_changes $f$, 'audit_immutable');
end $$;

-- Assignment rules: moderators only, active department, no duplicates, reason required, audited
do $$
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.admin_assign_moderator_department(test.moderator(), 1::smallint, 'short') $f$, 'reason_required');
  perform test.expect_error($f$ select public.admin_assign_moderator_department(test.alice(), 1::smallint, 'Alice is a student, not staff') $f$, 'not_moderator');
  perform test.expect_error($f$ select public.admin_assign_moderator_department(test.admin_y(), 1::smallint, 'Admins are not assigned departments') $f$, 'not_moderator');
  perform test.expect_error($f$ select public.admin_assign_moderator_department(test.moderator(), 32000::smallint, 'No such department exists') $f$, 'not_found');
  perform public.admin_assign_moderator_department(test.moderator(), 1::smallint, 'Synthetic department assignment');
  perform test.expect_error($f$ select public.admin_assign_moderator_department(test.moderator(), 1::smallint, 'Synthetic department assignment') $f$, 'already_assigned');
  perform public.admin_assign_moderator_department(test.moderator(), 2::smallint, 'Second synthetic department');
  perform test.assert((select moderator_count from public.admin_moderator_coverage() where department_id = 1) = 1, 'coverage counts one moderator in dept 1');
  perform test.assert((select moderators -> 0 ->> 'name' from public.admin_moderator_coverage() where department_id = 1) = 'Synthetic Moderator', 'coverage lists the moderator by name');
  perform test.assert((select moderator_count from public.admin_moderator_coverage() where department_id = 3) = 0, 'empty department shows zero');
  perform test.reset();

  perform test.assert((select count(*) from private.admin_audit where action = 'assign_moderator_department' and target_user_id = test.moderator()) = 2, 'each assignment audited');
  perform test.assert(exists (select 1 from private.admin_audit where action = 'assign_moderator_department' and evidence_ref = 'department:' || (select code from public.departments where id = 1)), 'audit names the department by code');

  perform test.as_user(test.moderator());
  perform test.assert((select count(*) from public.my_moderator_departments()) = 2, 'moderator sees their own two departments');
  perform test.reset();
  perform test.as_user(test.alice());
  perform test.assert((select count(*) from public.my_moderator_departments()) = 0, 'a student has no departments');
  perform test.reset();
end $$;

-- Unassign: audited; a missing assignment is not_found
do $$
begin
  perform test.as_user(test.admin_x());
  perform public.admin_unassign_moderator_department(test.moderator(), 2::smallint, 'Synthetic department removal');
  perform test.expect_error($f$ select public.admin_unassign_moderator_department(test.moderator(), 2::smallint, 'Synthetic department removal') $f$, 'not_found');
  perform test.reset();
  perform test.assert(not exists (select 1 from private.moderator_departments where user_id = test.moderator() and department_id = 2), 'assignment removed');
  perform test.assert(exists (select 1 from private.admin_audit where action = 'unassign_moderator_department' and target_user_id = test.moderator()), 'removal audited');
end $$;

-- D-R3: at most 4 moderators per department
do $$
declare
  v_ids uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_id uuid;
  i integer := 0;
begin
  foreach v_id in array v_ids loop
    i := i + 1;
    insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
    values (v_id, 'synthetic.mod' || i || '@example.test', now(), jsonb_build_object('full_name', 'Synthetic Mod ' || i));
    perform test.as_user(v_id);
    perform public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZM00' || i);
    perform test.reset();
    perform test.as_user(test.admin_x());
    perform public.admin_set_user_role(v_id, 'moderator', 'Synthetic moderator for limit test');
    perform test.reset();
  end loop;

  perform test.as_user(test.admin_x());
  -- dept 1 already has test.moderator(); three more fill it to 4
  perform public.admin_assign_moderator_department(v_ids[1], 1::smallint, 'Synthetic limit test assignment');
  perform public.admin_assign_moderator_department(v_ids[2], 1::smallint, 'Synthetic limit test assignment');
  perform public.admin_assign_moderator_department(v_ids[3], 1::smallint, 'Synthetic limit test assignment');
  perform test.expect_error(format($f$ select public.admin_assign_moderator_department(%L, 1::smallint, 'Fifth moderator must be refused') $f$, v_ids[4]), 'limit_reached');
  perform test.assert((select moderator_count from public.admin_moderator_coverage() where department_id = 1) = 4, 'department stays at 4');
  -- the fifth fits in another department
  perform public.admin_assign_moderator_department(v_ids[4], 3::smallint, 'Synthetic limit test assignment');
  perform test.reset();
end $$;

-- D-R6: demoting a moderator clears their departments and records history
do $$
declare v_id uuid := (select id from public.profiles where full_name = 'Synthetic Mod 1');
begin
  perform test.as_user(test.admin_x());
  perform public.admin_set_user_role(v_id, 'student', 'Synthetic demotion for test');
  perform test.assert((select count(*) from public.admin_user_role_history(v_id)) = 2, 'history has promotion and demotion');
  perform test.assert((select new_role from public.admin_user_role_history(v_id) limit 1) = 'student', 'newest history row first');
  perform test.assert((select changed_by_name from public.admin_user_role_history(v_id) limit 1) = 'Synthetic AdminX', 'history names the admin');
  -- setting the same role again records no history row
  perform public.admin_set_user_role(v_id, 'student', 'Same role, nothing changes');
  perform test.assert((select count(*) from public.admin_user_role_history(v_id)) = 2, 'no-op role change adds no history');
  perform test.reset();
  perform test.assert((select role from public.profiles where id = v_id) = 'student', 'demoted to student');
  perform test.assert(not exists (select 1 from private.moderator_departments where user_id = v_id), 'demotion cleared departments');
end $$;

-- D-R4: stepping down returns to the previous role; admins and students cannot use it
do $$
declare v_id uuid := (select id from public.profiles where full_name = 'Synthetic Mod 2');
begin
  perform test.as_user(test.alice());
  perform test.expect_error($f$ select public.moderator_step_down('Student cannot step down') $f$, 'forbidden');
  perform test.reset();
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.moderator_step_down('Admin cannot step down here') $f$, 'forbidden');
  perform test.reset();

  perform test.as_user(v_id);
  perform test.expect_error($f$ select public.moderator_step_down('short') $f$, 'reason_required');
  perform test.assert(public.moderator_step_down('Exams this semester, stepping down') = 'student', 'returns to student');
  perform test.reset();
  perform test.assert((select role from public.profiles where id = v_id) = 'student', 'role is student again');
  perform test.assert(not exists (select 1 from private.moderator_departments where user_id = v_id), 'step down cleared departments');
  perform test.assert(exists (select 1 from private.role_changes where user_id = v_id and old_role = 'moderator' and new_role = 'student' and changed_by = v_id), 'self-service change recorded');
  perform test.assert(exists (select 1 from private.admin_audit where action = 'moderator_step_down' and actor_id = v_id and target_user_id = v_id), 'step down audited');
  -- once stepped down, the person can no longer step down or moderate
  perform test.as_user(v_id);
  perform test.expect_error($f$ select public.moderator_step_down('Second attempt must fail') $f$, 'forbidden');
  perform test.reset();
end $$;

-- An alumnus moderator steps back down to alumni, not student
do $$
declare v_id uuid := (select id from public.profiles where full_name = 'Synthetic Mod 3');
begin
  perform test.as_user(test.admin_x());
  perform public.admin_set_user_role(v_id, 'alumni', 'Synthetic: mark as alumnus');
  perform public.admin_set_user_role(v_id, 'moderator', 'Synthetic: alumnus becomes moderator');
  perform test.reset();
  perform test.as_user(v_id);
  perform test.assert(public.moderator_step_down('Alumnus stepping down from moderation') = 'alumni', 'alumnus returns to alumni');
  perform test.reset();
  perform test.assert((select role from public.profiles where id = v_id) = 'alumni', 'role is alumni again');
end $$;

-- Account deletion keeps history rows (user nulled) and removes assignments
do $$
declare v_id uuid := (select id from public.profiles where full_name = 'Synthetic Mod 4');
begin
  perform set_config('app.profile_change', '1', true);
  update public.profiles set deletion_requested_at = now() where id = v_id;
  perform set_config('app.profile_change', '', true);
  perform public.delete_account_data(v_id);
  delete from auth.users where id = v_id;
  perform test.assert(not exists (select 1 from private.moderator_departments where user_id = v_id), 'assignments gone with the account');
  perform test.assert(not exists (select 1 from private.role_changes where user_id = v_id), 'history no longer points at the deleted account');
  perform test.assert(exists (select 1 from private.role_changes where user_id is null and new_role = 'moderator'), 'history row kept with user nulled');
end $$;

-- Activity counts (migration 020): staff see their own counts, admins see everyone's; counts only
do $$
declare v_id uuid;
begin
  v_id := test.make_pending(test.alice(), false);
  perform test.as_user(test.alice());
  perform test.expect_error($f$ select * from public.my_moderation_activity(7) $f$, 'forbidden');
  perform test.expect_error($f$ select * from public.admin_moderator_activity(30) $f$, 'forbidden');
  perform test.reset();

  perform test.as_user(test.moderator());
  perform test.assert((select decisions from public.my_moderation_activity(7)) = 0, 'no decisions yet');
  perform public.moderate_experience(v_id, 'approve');
  perform test.assert((select decisions from public.my_moderation_activity(7)) = 1, 'one decision counted');
  perform test.assert((select last_decision_at from public.my_moderation_activity(7)) is not null, 'last decision time set');
  perform test.expect_error($f$ select * from public.my_moderation_activity(0) $f$, 'invalid_input');
  perform test.expect_error($f$ select * from public.admin_moderator_activity(30) $f$, 'forbidden');
  perform test.reset();

  perform test.as_user(test.admin_x());
  perform test.assert((select decisions from public.admin_moderator_activity(30) where user_id = test.moderator()) = 1, 'admin sees the moderator count');
  perform test.assert(not exists (select 1 from public.admin_moderator_activity(30) where user_id = test.alice()), 'students are not listed');
  perform test.assert(exists (select 1 from public.admin_moderator_activity(30) where user_id = test.admin_y() and decisions = 0), 'idle admins listed with zero');
  perform test.reset();
end $$;

rollback;
