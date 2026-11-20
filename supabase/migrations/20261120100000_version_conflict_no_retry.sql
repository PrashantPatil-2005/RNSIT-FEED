-- Version conflicts must fail fast, not be retried.
--
-- save_draft and moderate_experience raised 'version_conflict' with SQLSTATE 40001
-- (serialization_failure). PostgREST treats 40001 as a transient error and re-runs the whole
-- transaction, and the conflict is permanent, so the request loops forever: the browser waits on
-- "Saving…" and a pooled database connection stays busy. Two open tabs were enough to trigger it.
--
-- PT409 is PostgREST's "respond with this HTTP status" code, so a conflict now returns HTTP 409
-- at once. The message stays 'version_conflict', which is what the app matches on.
--
-- Only the error code changes. Each live definition is read back and re-created with that one
-- substitution, so the function bodies cannot drift from 20261118100014. CREATE OR REPLACE keeps
-- the owner, grants, SECURITY DEFINER and search_path.
do $$
declare
  v_fn regprocedure;
  v_def text;
begin
  foreach v_fn in array array[
    'public.save_draft(uuid, integer, jsonb)'::regprocedure,
    'public.moderate_experience(uuid, text, public.reason_code, text, integer)'::regprocedure
  ] loop
    v_def := pg_get_functiondef(v_fn);
    if position($s$errcode = '40001'$s$ in v_def) = 0 then
      raise exception 'expected 40001 in %, definition changed', v_fn;
    end if;
    execute replace(v_def, $s$errcode = '40001'$s$, $s$errcode = 'PT409'$s$);
  end loop;
end $$;
