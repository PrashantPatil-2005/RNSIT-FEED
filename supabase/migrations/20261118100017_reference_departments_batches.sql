-- Reference data: VTU undergraduate (BE/B.Tech) branches and graduation years (owner request,
-- 2026-11-17). Not personal data. Safe to re-run: existing codes and years are left as they are.
--
-- The two-letter code is a display label (departments.code must match ^[A-Z]{2}$). It follows the
-- VTU USN branch code where one is known, but nothing derives a branch from a USN (USN rules).
-- An admin can hide a branch from onboarding by setting active = false.
--
-- CS, IS and EC come first so they keep ids 1-3; the test suite refers to those ids.

insert into public.departments (code, name) values
  ('CS', 'Computer Science and Engineering'),
  ('IS', 'Information Science and Engineering'),
  ('EC', 'Electronics and Communication Engineering'),
  ('EE', 'Electrical and Electronics Engineering'),
  ('ME', 'Mechanical Engineering'),
  ('CV', 'Civil Engineering'),
  ('AI', 'Artificial Intelligence and Machine Learning'),
  ('AD', 'Artificial Intelligence and Data Science'),
  ('CI', 'Computer Science and Engineering (Artificial Intelligence and Machine Learning)'),
  ('CD', 'Computer Science and Engineering (Data Science)'),
  ('CY', 'Computer Science and Engineering (Cyber Security)'),
  ('IC', 'Computer Science and Engineering (IoT, Cyber Security including Blockchain)'),
  ('CB', 'Computer Science and Business Systems'),
  ('CG', 'Computer Science and Design'),
  ('ET', 'Electronics and Telecommunication Engineering'),
  ('TE', 'Telecommunication Engineering'),
  ('EI', 'Electronics and Instrumentation Engineering'),
  ('EV', 'Electronics Engineering (VLSI Design and Technology)'),
  ('IT', 'Instrumentation Technology'),
  ('ML', 'Medical Electronics'),
  ('BM', 'Biomedical Engineering'),
  ('BT', 'Biotechnology'),
  ('CH', 'Chemical Engineering'),
  ('AE', 'Aeronautical Engineering'),
  ('AS', 'Aerospace Engineering'),
  ('AU', 'Automobile Engineering'),
  ('MT', 'Mechatronics'),
  ('RA', 'Robotics and Automation'),
  ('IM', 'Industrial Engineering and Management'),
  ('IP', 'Industrial and Production Engineering'),
  ('MI', 'Mining Engineering'),
  ('CR', 'Ceramics and Cement Technology'),
  ('PT', 'Polymer Science and Technology'),
  ('TX', 'Textile Technology'),
  ('AG', 'Agricultural Engineering'),
  ('MR', 'Marine Engineering')
on conflict (code) do nothing;

-- Graduation years: from 2000 (alumni) to 2035 (students admitted up to 2031), oldest first.
insert into public.batches (grad_year)
select y from generate_series(2000, 2035) as y
on conflict (grad_year) do nothing;
