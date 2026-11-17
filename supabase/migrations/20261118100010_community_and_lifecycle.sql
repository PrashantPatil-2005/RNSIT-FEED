-- RNSIT FEED: community interactions (helpful votes, comments, comment reports) and the
-- approved post-lifecycle additions (pending-post cancellation, 90-day rejected-post purge).
--
-- STATUS: LOCAL ONLY, NOT APPLIED to any hosted database.
-- Owner decisions: SC-1 (votes and comments in the MVP), O-4 (pending -> draft cancel;
-- rejected posts deleted 90 days after rejection), O-5 (public dates only), U5 (account
-- deletion removes the user's votes and comments), U7 (no path reveals an anonymous author).
--
-- Same rules as earlier migrations: API roles get NO direct table writes; every write goes through
-- a SECURITY DEFINER function with search_path = '' that re-reads the caller's role from the
-- database. Public reads go through owner-rights views whose columns are deliberate.
--
-- New enum values are added here and used only inside plpgsql bodies (resolved at run time), so
-- this file is safe to run inside a single transaction.

-- ---------- Types ----------
alter type public.mod_action add value if not exists 'cancel_submission';
alter type public.mod_action add value if not exists 'remove_comment';
alter type public.mod_action add value if not exists 'restore_comment';
alter type public.mod_action add value if not exists 'resolve_comment_report';
alter type public.mod_action add value if not exists 'dismiss_comment_report';

create type public.comment_status as enum ('visible', 'removed');

-- ---------- Tables ----------

-- One helpful vote per member per experience. Who voted is never exposed; only counts are.
create table public.experience_votes (
  experience_id uuid not null references public.experiences (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (experience_id, user_id)
);
create index experience_votes_user_idx on public.experience_votes (user_id);

-- Plain-text comments on approved experiences. Post-moderated: visible on creation, removable by
-- staff, deleted with the commenter's account (U5).
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(btrim(body)) between 2 and 2000),
  status public.comment_status not null default 'visible',
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index comments_experience_idx on public.comments (experience_id, created_at);
create index comments_author_idx on public.comments (author_id, created_at);

create table public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason public.report_reason not null,
  details text check (details is null or length(details) <= 1000),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint comment_reports_one_per_user unique (comment_id, reporter_id)
);
create index comment_reports_queue_idx on public.comment_reports (status, created_at);
create index comment_reports_reporter_idx on public.comment_reports (reporter_id);

-- The moderator log gains references for comment actions. Same rule: ON DELETE SET NULL, no text.
alter table public.moderation_actions
  add column comment_id uuid references public.comments (id) on delete set null,
  add column comment_report_id uuid references public.comment_reports (id) on delete set null;

-- The append-only trigger must allow the new references to go to NULL, and nothing else.
drop trigger moderation_actions_append_only on public.moderation_actions;
create trigger moderation_actions_append_only before update or delete on public.moderation_actions
  for each row execute function private.audit_append_only(
    'actor_id', 'experience_id', 'report_id', 'comment_id', 'comment_report_id');

-- Rejection time, used by the 90-day rejected-post purge (O-4).
alter table public.experiences add column rejected_at timestamptz;

-- ---------- Lifecycle helpers (replaced) ----------

-- Adds pending -> draft (author cancellation, O-4). Everything else is unchanged.
create or replace function private.valid_transition(p_from public.exp_status, p_to public.exp_status)
returns boolean language sql immutable set search_path = '' as $$
  select (p_from::text, p_to::text) in (
    ('draft', 'pending'), ('rejected', 'pending'),
    ('pending', 'approved'), ('pending', 'rejected'), ('pending', 'draft'),
    ('approved', 'removed'), ('removed', 'approved'),
    ('approved', 'withdrawn')
  )
$$;

-- Records the rejection time and clears the submission time on cancellation.
create or replace function private.transition_experience(p_id uuid, p_to public.exp_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.transition', '1', true);
  update public.experiences e set
    status = p_to,
    submitted_at = case when p_to = 'pending' then now()
                        when p_to = 'draft' then null
                        else e.submitted_at end,
    approved_at = case when p_to = 'approved' and e.approved_at is null then now() else e.approved_at end,
    withdrawn_at = case when p_to = 'withdrawn' then now() else e.withdrawn_at end,
    rejected_at = case when p_to = 'rejected' then now() else e.rejected_at end,
    updated_at = case when p_to = 'draft' then now() else e.updated_at end,
    moderation_note = case when p_to = 'approved' then null else e.moderation_note end
  where e.id = p_id;
  perform set_config('app.transition', '', true);
end $$;

create function private.log_mod_comment(
  p_action public.mod_action, p_experience uuid, p_comment uuid, p_comment_report uuid,
  p_actor uuid, p_role text, p_reason public.reason_code
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.moderation_actions
    (action, experience_id, comment_id, comment_report_id, actor_id, actor_role, reason_code)
  values (p_action, p_experience, p_comment, p_comment_report, p_actor, p_role, p_reason);
end $$;

create function private.close_open_comment_reports(p_comment uuid)
returns void language sql security definer set search_path = '' as $$
  update public.comment_reports set status = 'moot', resolved_at = now()
  where comment_id = p_comment and status = 'open'
$$;

-- Approved experiences only; the caller must be an onboarded, verified member.
create function private.require_live_experience(p_experience uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.experiences e where e.id = p_experience and e.status = 'approved') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end $$;

-- ---------- Member functions ----------

-- O-4: the author pulls a pending post back to draft before review.
create function public.cancel_submission(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_onboarded();
  v_status public.exp_status;
begin
  select e.status into v_status
  from public.experiences e
  join private.experience_authors a on a.experience_id = e.id
  where e.id = p_id and a.author_id = v_uid
  for update of e;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_status <> 'pending' then raise exception 'invalid_state' using errcode = '55000'; end if;
  perform private.transition_experience(p_id, 'draft');
  perform private.log_mod('cancel_submission', p_id, null, null, 'author', null);
end $$;

-- Sets or clears the caller's helpful vote. Idempotent. Returns the new public count.
create function public.set_helpful_vote(p_experience uuid, p_helpful boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_onboarded();
begin
  if p_helpful is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  perform private.require_live_experience(p_experience);
  if private.is_author(p_experience) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_helpful then
    insert into public.experience_votes (experience_id, user_id) values (p_experience, v_uid)
    on conflict do nothing;
  else
    delete from public.experience_votes where experience_id = p_experience and user_id = v_uid;
  end if;
  return (select count(*)::integer from public.experience_votes v where v.experience_id = p_experience);
end $$;

-- Adds a plain-text comment. Rate limited to 20 comments per member per hour.
create function public.add_comment(p_experience uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_onboarded();
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
  v_id uuid;
begin
  perform private.require_live_experience(p_experience);
  if length(v_body) < 2 or length(v_body) > 2000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if (select count(*) from public.comments c
      where c.author_id = v_uid and c.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'limit_reached' using errcode = '53400';
  end if;
  insert into public.comments (experience_id, author_id, body) values (p_experience, v_uid, v_body)
  returning id into v_id;
  return v_id;
end $$;

-- The commenter deletes their own comment permanently (its reports go with it).
create function public.delete_my_comment(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_member();
begin
  delete from public.comments c where c.id = p_id and c.author_id = v_uid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create function public.report_comment(p_id uuid, p_reason public.report_reason, p_details text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_onboarded();
  v_author uuid;
begin
  select c.author_id into v_author
  from public.comments c join public.experiences e on e.id = c.experience_id
  where c.id = p_id and c.status = 'visible' and e.status = 'approved';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_author = v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from public.comment_reports r where r.reporter_id = v_uid and r.status = 'open') >= 10 then
    raise exception 'limit_reached' using errcode = '53400';
  end if;
  insert into public.comment_reports (comment_id, reporter_id, reason, details)
  values (p_id, v_uid, p_reason, nullif(btrim(left(p_details, 1000)), ''))
  on conflict (comment_id, reporter_id) do nothing;
end $$;

-- ---------- Staff functions ----------

create function public.moderate_comment(p_id uuid, p_action text, p_reason public.reason_code default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_staff();
  v_role text := private.caller_role()::text;
  v_c public.comments%rowtype;
begin
  select c.* into v_c from public.comments c where c.id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_c.author_id = v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action = 'remove' then
    if v_c.status <> 'visible' then raise exception 'invalid_state' using errcode = '55000'; end if;
    if p_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
    update public.comments set status = 'removed', removed_at = now() where id = p_id;
    perform private.close_open_comment_reports(p_id);
    perform private.log_mod_comment('remove_comment', v_c.experience_id, p_id, null, v_uid, v_role, p_reason);
  elsif p_action = 'restore' then
    if v_c.status <> 'removed' then raise exception 'invalid_state' using errcode = '55000'; end if;
    update public.comments set status = 'visible', removed_at = null where id = p_id;
    perform private.log_mod_comment('restore_comment', v_c.experience_id, p_id, null, v_uid, v_role, null);
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;

create function public.resolve_comment_report(
  p_id uuid, p_outcome text, p_reason public.reason_code default null, p_remove boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_staff();
  v_role text := private.caller_role()::text;
  v_r public.comment_reports%rowtype;
  v_exp uuid;
begin
  select r.* into v_r from public.comment_reports r where r.id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_r.status <> 'open' then raise exception 'invalid_state' using errcode = '55000'; end if;
  select c.experience_id into v_exp from public.comments c where c.id = v_r.comment_id;
  if p_outcome = 'dismissed' then
    update public.comment_reports set status = 'dismissed', resolved_by = v_uid, resolved_at = now() where id = p_id;
    perform private.log_mod_comment('dismiss_comment_report', v_exp, v_r.comment_id, p_id, v_uid, v_role, p_reason);
  elsif p_outcome = 'actioned' then
    update public.comment_reports set status = 'actioned', resolved_by = v_uid, resolved_at = now() where id = p_id;
    perform private.log_mod_comment('resolve_comment_report', v_exp, v_r.comment_id, p_id, v_uid, v_role, p_reason);
    if p_remove then
      perform public.moderate_comment(v_r.comment_id, 'remove', p_reason);
    end if;
  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
end $$;

-- ---------- Maintenance (service role only) ----------

-- O-4: rejected posts are deleted once 90 days have passed since rejection with no author activity.
create function public.purge_rejected_experiences(p_days integer default 90)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if p_days is null or p_days < 1 then raise exception 'invalid_input' using errcode = '22023'; end if;
  delete from public.experiences e
  where e.status = 'rejected'
    and greatest(coalesce(e.rejected_at, e.updated_at), e.updated_at) < now() - make_interval(days => p_days);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Account deletion (U5) also clears free text the user wrote in comment reports. Their comments
-- and votes are removed by ON DELETE CASCADE when the profile row goes.
create or replace function public.delete_account_data(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role;
begin
  select p.role into v_role from public.profiles p where p.id = p_user and p.deletion_requested_at is not null;
  if not found then raise exception 'deletion_not_requested' using errcode = '55000'; end if;
  if v_role = 'admin' and (
    select count(*) from public.profiles p where p.role = 'admin' and p.deletion_requested_at is null
  ) < 1 then
    raise exception 'last_admin' using errcode = '55000';
  end if;
  delete from public.experiences e using private.experience_authors a
  where a.experience_id = e.id and a.author_id = p_user;
  update public.reports set details = null where reporter_id = p_user;
  update public.comment_reports set details = null where reporter_id = p_user;
  delete from public.comments where author_id = p_user;
  delete from public.experience_votes where user_id = p_user;
  delete from private.profile_private where user_id = p_user;
  delete from public.profiles where id = p_user;
  insert into private.deletion_ledger (user_id) values (p_user) on conflict do nothing;
end $$;

-- ---------- Views ----------

-- Public engagement counts for approved posts only.
create view public.public_engagement with (security_invoker = false) as
select
  e.id as experience_id,
  (select count(*)::integer from public.experience_votes v where v.experience_id = e.id) as helpful_count,
  (select count(*)::integer from public.comments c where c.experience_id = e.id and c.status = 'visible') as comment_count
from public.experiences e
where e.status = 'approved';

-- Public comments. No author id is exposed. A comment by the author of an ANONYMOUS post shows no
-- name (only by_post_author), so commenting can never reveal an anonymous author (U7).
-- is_mine compares with auth.uid() and is false for visitors. Dates only (O-5).
create view public.public_comments with (security_invoker = false) as
select
  c.id,
  c.experience_id,
  c.body,
  case when a.author_id = c.author_id and e.is_anonymous is not false then null else p.full_name end as author_name,
  coalesce(a.author_id = c.author_id, false) as by_post_author,
  coalesce(c.author_id = auth.uid(), false) as is_mine,
  c.created_at::date as posted_on,
  -- Display order without exposing the time of day.
  row_number() over (partition by c.experience_id order by c.created_at, c.id)::integer as seq
from public.comments c
join public.experiences e on e.id = c.experience_id and e.status = 'approved'
join public.profiles p on p.id = c.author_id
left join private.experience_authors a on a.experience_id = c.experience_id
where c.status = 'visible';

-- The caller's own votes (to render the toggle state).
create view public.my_votes with (security_invoker = false) as
select v.experience_id, v.created_at
from public.experience_votes v
where v.user_id = auth.uid();

-- The caller's own comments, including removed ones (so they learn of removal).
create view public.my_comments with (security_invoker = false) as
select c.id, c.experience_id, c.body, c.status, c.created_at, c.removed_at
from public.comments c
where c.author_id = auth.uid();

create view public.my_comment_reports with (security_invoker = false) as
select r.id, r.comment_id, r.reason, r.details, r.status, r.created_at
from public.comment_reports r
where r.reporter_id = auth.uid();

-- Staff: comments with the same anonymous-author masking as the public view.
create view public.moderation_comments with (security_invoker = false) as
select
  c.id, c.experience_id, c.body, c.status, c.created_at, c.removed_at,
  case when a.author_id = c.author_id and e.is_anonymous is not false then null else p.full_name end as author_name,
  coalesce(a.author_id = c.author_id, false) as by_post_author,
  (select count(*)::integer from public.comment_reports r where r.comment_id = c.id and r.status = 'open') as open_reports
from public.comments c
join public.experiences e on e.id = c.experience_id
join public.profiles p on p.id = c.author_id
left join private.experience_authors a on a.experience_id = c.experience_id
where private.is_staff();

-- Staff: comment reports without reporter identity.
create view public.moderation_comment_reports with (security_invoker = false) as
select r.id, r.comment_id, c.experience_id, r.reason, r.details, r.status, r.created_at
from public.comment_reports r
join public.comments c on c.id = r.comment_id
where private.is_staff();

-- Authors' feedback must not list comment actions on their post (they concern other people).
create or replace view public.my_moderation_feedback with (security_invoker = false) as
select m.id, m.experience_id, m.action, m.reason_code, m.created_at
from public.moderation_actions m
join private.experience_authors a on a.experience_id = m.experience_id
where a.author_id = auth.uid() and m.comment_id is null and m.comment_report_id is null;

-- ---------- RLS and grants ----------
alter table public.experience_votes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_reports enable row level security;
-- No policies: API roles are denied on the base tables. Reads go through the views above.

revoke all on public.experience_votes, public.comments, public.comment_reports
  from public, anon, authenticated;
revoke all on public.public_engagement, public.public_comments, public.my_votes, public.my_comments,
  public.my_comment_reports, public.moderation_comments, public.moderation_comment_reports
  from public, anon, authenticated;
revoke execute on function
  private.log_mod_comment(public.mod_action, uuid, uuid, uuid, uuid, text, public.reason_code),
  private.close_open_comment_reports(uuid),
  private.require_live_experience(uuid),
  public.cancel_submission(uuid),
  public.set_helpful_vote(uuid, boolean),
  public.add_comment(uuid, text),
  public.delete_my_comment(uuid),
  public.report_comment(uuid, public.report_reason, text),
  public.moderate_comment(uuid, text, public.reason_code),
  public.resolve_comment_report(uuid, text, public.reason_code, boolean),
  public.purge_rejected_experiences(integer)
  from public, anon, authenticated;

grant select on public.public_engagement, public.public_comments to anon, authenticated;
grant select on public.my_votes, public.my_comments, public.my_comment_reports,
  public.moderation_comments, public.moderation_comment_reports to authenticated;

grant execute on function
  public.cancel_submission(uuid),
  public.set_helpful_vote(uuid, boolean),
  public.add_comment(uuid, text),
  public.delete_my_comment(uuid),
  public.report_comment(uuid, public.report_reason, text),
  public.moderate_comment(uuid, text, public.reason_code),
  public.resolve_comment_report(uuid, text, public.reason_code, boolean)
  to authenticated;

grant execute on function public.purge_rejected_experiences(integer) to service_role;
