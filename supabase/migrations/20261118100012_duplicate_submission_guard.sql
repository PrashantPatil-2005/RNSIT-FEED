-- Phase 2: duplicate-submission protection.
--
-- STATUS: LOCAL ONLY, NOT APPLIED to any hosted database.
--
-- submit_experience already refuses a second submit of the same post (only draft or rejected can
-- move to pending) and caps an author at 5 pending posts. This adds a content-level guard: an
-- author cannot submit an experience for the same company, role and recruitment year as one of
-- their own posts that is already pending or approved. Withdrawn, removed and rejected posts do
-- not block a new submission (withdraw-and-repost is the approved way to correct a post, U6/U12).
-- The check uses only the caller's own posts, so it reveals nothing about anyone else.

create or replace function public.submit_experience(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.require_onboarded();
  v_exp public.experiences%rowtype;
begin
  select e.* into v_exp
  from public.experiences e
  join private.experience_authors a on a.experience_id = e.id
  where e.id = p_id and a.author_id = v_uid
  for update of e;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_exp.status not in ('draft', 'rejected') then
    raise exception 'invalid_state' using errcode = '55000';
  end if;
  if v_exp.company_id is null or v_exp.role_title is null or v_exp.opportunity_type is null
     or v_exp.campus_type is null or v_exp.recruitment_year is null or v_exp.result is null
     or v_exp.is_anonymous is null
     or not exists (select 1 from public.rounds r where r.experience_id = p_id)
     or not exists (select 1 from public.questions q join public.rounds r on r.id = q.round_id
                    where r.experience_id = p_id) then
    raise exception 'incomplete' using errcode = '22023';
  end if;
  if exists (
    select 1
    from private.experience_authors a
    join public.experiences o on o.id = a.experience_id
    where a.author_id = v_uid
      and o.id <> p_id
      and o.status in ('pending', 'approved')
      and o.company_id = v_exp.company_id
      and o.recruitment_year = v_exp.recruitment_year
      and lower(btrim(o.role_title)) = lower(btrim(v_exp.role_title))
  ) then
    raise exception 'duplicate_submission' using errcode = '23505';
  end if;
  if (select count(*) from private.experience_authors a
      join public.experiences e on e.id = a.experience_id
      where a.author_id = v_uid and e.status = 'pending') >= 5 then
    raise exception 'limit_reached' using errcode = '53400';
  end if;
  perform private.transition_experience(p_id, 'pending');
  perform private.log_mod(
    case when v_exp.status = 'draft' then 'submit'::public.mod_action else 'resubmit'::public.mod_action end,
    p_id, null, null, 'author', null);
end $$;
