-- Site settings (migration 026): admin-only, audited, allowlisted keys, validated values, and the
-- switches are enforced by the database.
begin;

-- Defaults: everything open, no notice, readable by visitors
do $$
declare v jsonb;
begin
  perform test.as_anon();
  v := public.site_status();
  perform test.reset();
  perform test.assert(v ->> 'notice' is null, 'no notice by default');
  perform test.assert((v ->> 'signups_open')::boolean and (v ->> 'posting_open')::boolean and (v ->> 'comments_open')::boolean, 'all switches open by default');
end $$;

-- Only admins can read or change settings
do $$
declare v_uid uuid;
begin
  perform test.as_anon();
  perform test.expect_error($f$ select public.admin_set_setting('posting_open', 'false', 'Synthetic settings change') $f$, 'permission denied');
  perform test.expect_error($f$ select * from public.admin_list_settings() $f$, 'permission denied');
  perform test.reset();
  foreach v_uid in array array[test.alice(), test.moderator()] loop
    perform test.as_user(v_uid);
    perform test.expect_error($f$ select public.admin_set_setting('posting_open', 'false', 'Synthetic settings change') $f$, 'forbidden');
    perform test.expect_error($f$ select * from public.admin_list_settings() $f$, 'forbidden');
    perform test.expect_error($f$ select private.setting_on('posting_open') $f$, 'permission denied');
    perform test.reset();
  end loop;
  perform test.assert(not exists (select 1 from private.settings where key = 'posting_open'), 'refused calls changed nothing');
end $$;

-- Validation and audit
do $$
declare v_audit integer := (select count(*) from private.admin_audit where action = 'change_setting');
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.admin_set_setting('posting_open', 'false', 'short') $f$, 'reason_required');
  perform test.expect_error($f$ select public.admin_set_setting('posting_open', 'maybe', 'Synthetic settings change') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_set_setting('owner_email', 'x@example.test', 'Synthetic settings change') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_set_setting('environment', 'production', 'Synthetic settings change') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_set_setting('alumni_invite_days', '0', 'Synthetic settings change') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_set_setting('alumni_invite_days', '366', 'Synthetic settings change') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_set_setting('site_notice', repeat('x', 281), 'Synthetic settings change') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_set_setting('site_notice', e'two\nlines', 'Synthetic settings change') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_set_setting('allowed_email_domain', 'not a domain', 'Synthetic settings change') $f$, 'invalid_input');
  perform test.expect_error($f$ select public.admin_set_setting('allowed_email_domain', 'example', 'Synthetic settings change') $f$, 'invalid_input');

  perform public.admin_set_setting('alumni_invite_days', ' 30 ', 'Synthetic settings change');
  perform public.admin_set_setting('site_notice', '  Placement season starts Monday  ', 'Synthetic settings change');
  perform public.admin_set_setting('posting_open', 'FALSE', 'Synthetic settings change');
  perform test.reset();

  perform test.assert((select value from private.settings where key = 'alumni_invite_days') = '30', 'invite days saved and trimmed');
  perform test.assert((select value from private.settings where key = 'posting_open') = 'false', 'switch saved in lower case');
  perform test.assert((select count(*) from private.admin_audit where action = 'change_setting') = v_audit + 3, 'only successful changes audited');
  perform test.assert(not exists (
    select 1 from private.admin_audit where action = 'change_setting' and coalesce(evidence_ref, '') like '%Placement%'
  ), 'notice text is not copied into the audit log');

  perform test.as_anon();
  perform test.assert(public.site_status() ->> 'notice' = 'Placement season starts Monday', 'visitors see the notice');
  perform test.assert(not (public.site_status() ->> 'posting_open')::boolean, 'visitors see posting closed');
  perform test.reset();

  perform test.as_user(test.admin_x());
  perform test.assert((select count(*) from public.admin_list_settings()) = 4, 'admins list the changed keys and the domain');
  perform public.admin_set_setting('site_notice', '   ', 'Synthetic settings change');
  perform test.reset();
  perform test.assert(not exists (select 1 from private.settings where key = 'site_notice'), 'an empty notice removes it');
end $$;

-- Posting paused: members cannot submit, admins can, drafts still save
do $$
declare v_id uuid;
begin
  perform test.expect_error($f$ select test.make_pending(test.alice(), false) $f$, 'posting_paused');
  v_id := test.make_pending(test.admin_x(), false);
  perform test.assert((select status from public.experiences where id = v_id) = 'pending', 'admins can still submit');
  update private.settings set value = 'true' where key = 'posting_open';
  v_id := test.make_pending(test.alice(), false);
  perform test.assert((select status from public.experiences where id = v_id) = 'pending', 'members submit again once reopened');
end $$;

-- Comments paused: members cannot comment, staff can
do $$
declare v_post uuid := test.make_approved(test.bob(), false);
begin
  perform test.as_user(test.admin_x());
  perform public.admin_set_setting('comments_open', 'false', 'Synthetic settings change');
  perform test.reset();
  perform test.as_user(test.alice());
  perform test.expect_error(format($f$ select public.add_comment(%L::uuid, 'Synthetic comment text') $f$, v_post), 'comments_paused');
  perform test.reset();
  perform test.as_user(test.moderator());
  perform public.add_comment(v_post, 'Synthetic staff comment');
  perform test.reset();
  perform test.assert((select count(*) from public.comments where experience_id = v_post) = 1, 'only the staff comment was added');
end $$;

-- Sign-ups paused: new accounts refused, the owner still allowed
do $$
begin
  perform test.as_user(test.admin_x());
  perform public.admin_set_setting('signups_open', 'false', 'Synthetic settings change');
  perform test.reset();
  perform test.expect_error($f$ insert into auth.users (email, email_confirmed_at) values ('synthetic.late@example.test', now()) $f$, 'signups_paused');
  insert into private.settings (key, value) values ('owner_email', 'synthetic.owner2@example.test');
  insert into auth.users (id, email, email_confirmed_at)
  values ('c0000000-0000-4000-8000-000000000011', 'synthetic.owner2@example.test', now());
  perform test.assert((select role from public.profiles where id = 'c0000000-0000-4000-8000-000000000011') = 'admin', 'owner can sign up while sign-ups are paused');
end $$;

-- Domain change is owner only once an owner is configured
do $$
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.admin_set_setting('allowed_email_domain', 'other.test', 'Synthetic settings change') $f$, 'owner_only');
  perform test.reset();
  perform test.assert((select value from private.settings where key = 'allowed_email_domain') = 'example.test', 'domain unchanged');
end $$;

rollback;
