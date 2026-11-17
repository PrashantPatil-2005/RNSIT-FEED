-- TEST-ONLY synthetic seed data. Every USN here is SYNTHETIC: year "00" and department "ZZ" cannot
-- belong to any real student. Never put real names, emails or USNs in this file.

begin;

insert into private.settings (key, value) values
  ('allowed_email_domain', 'example.test'),
  ('environment', 'development'),
  ('usn_objection_days', '7'),
  ('usn_release_enabled', 'true');

insert into public.departments (code, name) values
  ('CS', 'Computer Science (synthetic)'),
  ('IS', 'Information Science (synthetic)'),
  ('EC', 'Electronics (synthetic)');
insert into public.batches (grad_year) values (2026), (2027);
insert into public.topics (slug, name) values ('dsa', 'DSA'), ('dbms', 'DBMS'), ('os', 'OS');

insert into public.companies (name, slug) values
  ('Acme Synthetic', 'acme-synthetic'),
  ('Globex Synthetic', 'globex-synthetic');
insert into public.company_aliases (company_id, alias)
select c.id, 'Acme Ltd' from public.companies c where c.slug = 'acme-synthetic';

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (test.alice(),     'synthetic.alice@example.test',     now(), '{"full_name":"Synthetic Alice"}'),
  (test.bob(),       'synthetic.bob@example.test',       now(), '{"full_name":"Synthetic Bob"}'),
  (test.moderator(), 'synthetic.moderator@example.test', now(), '{"full_name":"Synthetic Moderator"}'),
  (test.admin_x(),   'synthetic.adminx@example.test',    now(), '{"full_name":"Synthetic AdminX"}'),
  (test.admin_y(),   'synthetic.adminy@example.test',    now(), '{"full_name":"Synthetic AdminY"}'),
  (test.claimant(),  'synthetic.claimant@example.test',  now(), '{"full_name":"Synthetic Claimant"}');

-- Onboard everyone except the claimant (who is used by the dispute tests).
select test.as_user(test.alice());     select public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ001'); select test.reset();
select test.as_user(test.bob());       select public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ002'); select test.reset();
select test.as_user(test.moderator()); select public.complete_onboarding(1::smallint, 1::smallint, '1RN00ZZ003'); select test.reset();
select test.as_user(test.admin_x());   select public.complete_onboarding(2::smallint, 1::smallint, '1RN00ZZ004'); select test.reset();
select test.as_user(test.admin_y());   select public.complete_onboarding(2::smallint, 1::smallint, '1RN00ZZ005'); select test.reset();

-- Bootstrap the two admins (owner-only function, no API grant), then admin X appoints the moderator.
select private.bootstrap_admin(test.admin_x(), 'Synthetic bootstrap for tests only');
select private.bootstrap_admin(test.admin_y(), 'Synthetic bootstrap for tests only');
select test.as_user(test.admin_x());
select public.admin_set_user_role(test.moderator(), 'moderator', 'Synthetic moderator appointment');
select test.reset();

commit;
