-- Read-side views. They run with OWNER rights on purpose (security_invoker = false), because API
-- roles have no access to the base tables. Postgres/Supabase views bypass RLS by default, so every
-- column here is a deliberate public decision, and a test fails if a column is added unreviewed.
-- No view ever exposes an author id, an author name for an anonymous post, an email or a USN.

create view public.public_experiences with (security_invoker = false) as
select
  e.id,
  c.name as company_name,
  c.slug as company_slug,
  e.role_title,
  e.opportunity_type,
  e.campus_type,
  d.code as department_code,
  d.name as department_name,
  b.grad_year as batch_year,
  e.recruitment_year,
  e.min_cgpa,
  e.backlogs_allowed,
  e.result,
  e.prep_tips,
  e.is_anonymous,
  case when e.is_anonymous is false then p.full_name end as author_name,
  e.approved_at::date as published_on   -- date only: coarse on purpose (re-identification by timing)
from public.experiences e
join public.companies c on c.id = e.company_id
join public.departments d on d.id = e.department_id
join public.batches b on b.id = e.batch_id
left join private.experience_authors a on a.experience_id = e.id and e.is_anonymous is false
left join public.profiles p on p.id = a.author_id
where e.status = 'approved';

create view public.public_rounds with (security_invoker = false) as
select
  r.id, r.experience_id, r.position, r.round_type, r.duration_min, r.platform, r.difficulty, r.notes,
  coalesce((select array_agg(t.slug order by t.slug)
            from public.round_topics rt join public.topics t on t.id = rt.topic_id
            where rt.round_id = r.id), '{}'::text[]) as topics
from public.rounds r
join public.experiences e on e.id = r.experience_id
where e.status = 'approved';

create view public.public_questions with (security_invoker = false) as
select
  q.id, q.round_id, r.experience_id, q.position, q.body,
  coalesce((select array_agg(t.slug order by t.slug)
            from public.question_topics qt join public.topics t on t.id = qt.topic_id
            where qt.question_id = q.id), '{}'::text[]) as topics
from public.questions q
join public.rounds r on r.id = q.round_id
join public.experiences e on e.id = r.experience_id
where e.status = 'approved';

create view public.public_resources with (security_invoker = false) as
select x.experience_id, x.position, x.url, x.label
from public.experience_resources x
join public.experiences e on e.id = x.experience_id
where e.status = 'approved';

create view public.public_eligible_departments with (security_invoker = false) as
select x.experience_id, d.code as department_code
from public.experience_eligible_departments x
join public.departments d on d.id = x.department_id
join public.experiences e on e.id = x.experience_id
where e.status = 'approved';

-- Aggregates count approved posts only: pending, rejected, removed, withdrawn and draft never count.
create view public.company_stats with (security_invoker = false) as
select
  c.id as company_id,
  c.name,
  c.slug,
  count(e.id)::integer as post_count,
  (select round(avg(r.difficulty)::numeric, 2)
   from public.rounds r join public.experiences e2 on e2.id = r.experience_id
   where e2.company_id = c.id and e2.status = 'approved' and r.difficulty is not null) as avg_difficulty,
  coalesce((select jsonb_object_agg(x.round_type, x.n)
            from (select r.round_type, count(*) as n
                  from public.rounds r join public.experiences e3 on e3.id = r.experience_id
                  where e3.company_id = c.id and e3.status = 'approved'
                  group by r.round_type) x), '{}'::jsonb) as round_type_counts,
  coalesce((select jsonb_object_agg(y.result, y.n)
            from (select e4.result, count(*) as n
                  from public.experiences e4
                  where e4.company_id = c.id and e4.status = 'approved'
                  group by e4.result) y), '{}'::jsonb) as result_counts
from public.companies c
join public.experiences e on e.company_id = c.id and e.status = 'approved'
group by c.id, c.name, c.slug;

-- ---------- Author-only views (filter on the caller) ----------

create view public.my_experiences with (security_invoker = false) as
select e.id, e.status, e.row_version, e.company_id, e.role_title, e.opportunity_type, e.campus_type,
       e.recruitment_year, e.result, e.is_anonymous, e.moderation_note,
       e.created_at, e.updated_at, e.submitted_at, e.approved_at, e.withdrawn_at
from public.experiences e
join private.experience_authors a on a.experience_id = e.id
where a.author_id = auth.uid();

-- Action, reason code and time only. The moderator or admin identity is not exposed to authors.
create view public.my_moderation_feedback with (security_invoker = false) as
select m.id, m.experience_id, m.action, m.reason_code, m.created_at
from public.moderation_actions m
join private.experience_authors a on a.experience_id = m.experience_id
where a.author_id = auth.uid();

create view public.my_reports with (security_invoker = false) as
select r.id, r.experience_id, r.reason, r.details, r.status, r.created_at
from public.reports r
where r.reporter_id = auth.uid();

create view public.my_notices with (security_invoker = false) as
select n.id, n.kind, n.ref_id, n.created_at, n.read_at
from private.user_notices n
where n.user_id = auth.uid();

-- ---------- Staff views (moderators and admins) ----------
-- Author name appears only on non-anonymous posts. Anonymous authors are hidden from moderators
-- as an INTERIM default while decision U7 is unresolved.

create view public.moderation_experiences with (security_invoker = false) as
select
  e.id, e.status, c.name as company_name, e.role_title, e.opportunity_type, e.campus_type,
  d.code as department_code, b.grad_year as batch_year, e.recruitment_year, e.result,
  e.is_anonymous, e.moderation_note, e.submitted_at,
  case when e.is_anonymous is false then p.full_name end as author_name
from public.experiences e
join public.companies c on c.id = e.company_id
join public.departments d on d.id = e.department_id
join public.batches b on b.id = e.batch_id
left join private.experience_authors a on a.experience_id = e.id and e.is_anonymous is false
left join public.profiles p on p.id = a.author_id
where private.is_staff() and e.status in ('pending', 'approved', 'removed');

-- No reporter identity.
create view public.moderation_reports with (security_invoker = false) as
select r.id, r.experience_id, r.reason, r.details, r.status, r.created_at
from public.reports r
where private.is_staff();

-- Moderator-visible history. Contains no admin-only events and no author identity.
create view public.moderation_history with (security_invoker = false) as
select m.id, m.action, m.experience_id, m.report_id, m.actor_role, m.reason_code, m.created_at
from public.moderation_actions m
where private.is_staff();
