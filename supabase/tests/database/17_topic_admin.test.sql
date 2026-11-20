-- Topic management (migration 022): admin-only, audited, add and rename only, no duplicates.
begin;

-- Only admins can add or rename topics
do $$
declare v_uid uuid;
declare v_topic smallint := (select id from public.topics where slug = 'dsa');
begin
  perform test.as_anon();
  perform test.expect_error($f$ select public.admin_create_topic('Graphs', 'graphs', 'Adding a synthetic topic') $f$, 'permission denied');
  perform test.expect_error(format($f$ select public.admin_rename_topic(%s::smallint, 'Algorithms', 'Renaming a synthetic topic') $f$, v_topic), 'permission denied');
  perform test.reset();
  foreach v_uid in array array[test.alice(), test.moderator()] loop
    perform test.as_user(v_uid);
    perform test.expect_error($f$ select public.admin_create_topic('Graphs', 'graphs', 'Adding a synthetic topic') $f$, 'forbidden');
    perform test.expect_error(format($f$ select public.admin_rename_topic(%s::smallint, 'Algorithms', 'Renaming a synthetic topic') $f$, v_topic), 'forbidden');
    perform test.expect_error($f$ insert into public.topics (slug, name) values ('direct', 'Direct insert') $f$, 'permission denied');
    perform test.reset();
  end loop;
  perform test.assert(not exists (select 1 from public.topics where slug in ('graphs', 'direct')), 'refused calls created no topic');
  perform test.assert((select name from public.topics where id = v_topic) = 'DSA', 'refused calls renamed nothing');
end $$;

-- Admin adds a topic; it is audited and readable by everyone
do $$
declare
  v_id smallint;
  v_audit integer := (select count(*) from private.admin_audit where action = 'manage_topic');
begin
  perform test.as_user(test.admin_x());
  v_id := public.admin_create_topic('  Graph Theory ', 'Graph-Theory', 'Adding a synthetic topic');
  perform test.reset();
  perform test.assert((select name from public.topics where id = v_id) = 'Graph Theory', 'name trimmed');
  perform test.assert((select slug from public.topics where id = v_id) = 'graph-theory', 'slug lowercased');
  perform test.assert((select count(*) from private.admin_audit where action = 'manage_topic') = v_audit + 1, 'creation audited');
  perform test.as_anon();
  perform test.assert(exists (select 1 from public.topics where slug = 'graph-theory'), 'visitors can read the new topic');
  perform test.reset();
end $$;

-- Input rules: reason, duplicates by slug or by name (any case), slug format
do $$
begin
  perform test.as_user(test.admin_x());
  perform test.expect_error($f$ select public.admin_create_topic('Graphs', 'graphs', 'short') $f$, 'reason_required');
  perform test.expect_error($f$ select public.admin_create_topic('Data Structures', 'dsa', 'Adding a synthetic topic') $f$, 'topics_slug_key');
  perform test.expect_error($f$ select public.admin_create_topic(' dsa ', 'dsa-again', 'Adding a synthetic topic') $f$, 'topics_name_lower_key');
  perform test.expect_error($f$ select public.admin_create_topic('Bad Slug', 'Bad Slug!', 'Adding a synthetic topic') $f$, 'check');
  perform test.expect_error($f$ select public.admin_create_topic('X', 'x-topic', 'Adding a synthetic topic') $f$, 'check');
  perform test.reset();
end $$;

-- Rename keeps the id and slug, so tagged rounds and links keep working
do $$
declare
  v_topic smallint := (select id from public.topics where slug = 'os');
  v_audit integer := (select count(*) from private.admin_audit where action = 'manage_topic');
begin
  perform test.as_user(test.admin_x());
  perform public.admin_rename_topic(v_topic, ' Operating Systems ', 'Renaming a synthetic topic');
  perform test.expect_error($f$ select public.admin_rename_topic(32000::smallint, 'Nothing', 'Renaming a synthetic topic') $f$, 'not_found');
  perform test.expect_error(format($f$ select public.admin_rename_topic(%s::smallint, 'DBMS', 'Renaming a synthetic topic') $f$, v_topic), 'topics_name_lower_key');
  perform test.expect_error(format($f$ select public.admin_rename_topic(%s::smallint, 'Operating Systems', 'short') $f$, v_topic), 'reason_required');
  perform test.reset();
  perform test.assert((select name from public.topics where id = v_topic) = 'Operating Systems', 'renamed and trimmed');
  perform test.assert((select slug from public.topics where id = v_topic) = 'os', 'slug unchanged');
  perform test.assert((select count(*) from private.admin_audit where action = 'manage_topic') = v_audit + 1, 'only the successful rename audited');
end $$;

rollback;
