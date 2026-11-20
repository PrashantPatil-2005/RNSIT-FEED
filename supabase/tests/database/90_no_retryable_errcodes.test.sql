-- No function may raise a SQLSTATE that PostgREST retries (40001 serialization_failure,
-- 40P01 deadlock_detected) for a permanent condition: the request would loop forever.
-- See 20261120100000_version_conflict_no_retry.sql.
begin;

do $$
declare v_bad text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prosrc ~ $r$errcode\s*=\s*'40(001|P01)'$r$;
  if v_bad is not null then
    raise exception 'functions raise a retryable SQLSTATE: %', v_bad;
  end if;
end $$;

-- A stale save still fails with the same message the app matches on, now as PT409.
do $$
declare
  v_id uuid;
  v_state text;
  v_msg text;
begin
  perform test.as_user(test.alice());
  v_id := (public.save_draft(null, null, '{"role_title":"Synthetic conflict check"}'::jsonb) ->> 'id')::uuid;
  perform public.save_draft(v_id, 1, '{"role_title":"Synthetic conflict check, tab B"}'::jsonb);
  begin
    perform public.save_draft(v_id, 1, '{"role_title":"Synthetic conflict check, stale tab"}'::jsonb);
    raise exception 'stale save was accepted';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  if v_state <> 'PT409' or v_msg <> 'version_conflict' then
    raise exception 'stale save: expected PT409 version_conflict, got % %', v_state, v_msg;
  end if;
  perform test.reset();
end $$;

rollback;
