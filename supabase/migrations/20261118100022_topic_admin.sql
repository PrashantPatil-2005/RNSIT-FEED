-- Admin management of interview topics (DSA, DBMS, ...), which members tag rounds and questions with.
-- Until now topics could only be changed with SQL. Admins can add and rename topics; there is no
-- delete, because rounds and questions reference topics (on delete restrict) and removing one would
-- silently change published posts. Every change is audited ('manage_topic').

-- Two topics must not differ only by case or spacing ("DSA" and "dsa ").
create unique index if not exists topics_name_lower_key on public.topics (lower(btrim(name)));

create function public.admin_create_topic(p_name text, p_slug text, p_reason text)
returns smallint language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
  v_id smallint;
begin
  perform private.log_admin('manage_topic', v_uid, null, null, null, p_reason);
  insert into public.topics (name, slug) values (btrim(p_name), lower(btrim(p_slug))) returning id into v_id;
  return v_id;
end $$;

-- Renaming keeps the slug, so existing links and filters keep working.
create function public.admin_rename_topic(p_topic smallint, p_name text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_admin();
begin
  if not exists (select 1 from public.topics t where t.id = p_topic) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.log_admin('manage_topic', v_uid, null, null, null, p_reason);
  update public.topics set name = btrim(p_name) where id = p_topic;
end $$;

revoke execute on function public.admin_create_topic(text, text, text) from public, anon;
revoke execute on function public.admin_rename_topic(smallint, text, text) from public, anon;
grant execute on function public.admin_create_topic(text, text, text) to authenticated;
grant execute on function public.admin_rename_topic(smallint, text, text) to authenticated;
