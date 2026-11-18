#!/usr/bin/env bash
# Daily maintenance for one RNSIT FEED Supabase project (dev or prod).
#   1. keep-alive read (free projects pause after about a week without activity)
#   2. retention clean-up: expired alumni-invite emails, idle drafts (90 d), returned/rejected
#      posts (90 d), deletion ledger (30 d)  -- decisions O-4, U3, U15
#   3. account deletion requests: delete the member's data, then their auth account (U5)
#
# Needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server-only secret), curl, jq.
# Logs contain counts only: never ids, emails or names (GitHub keeps logs 90 days).
set -euo pipefail

: "${SUPABASE_URL:?missing}"
: "${SUPABASE_SERVICE_ROLE_KEY:?missing}"
URL="${SUPABASE_URL%/}"
H=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

rpc() { # rpc <function> <json-body>
  curl -fsS -X POST "$URL/rest/v1/rpc/$1" "${H[@]}" -H "Content-Type: application/json" -d "$2"
}

curl -fsS "$URL/rest/v1/departments?select=id&limit=1" "${H[@]}" > /dev/null
echo "keep-alive: ok"

echo "expired invite emails cleared: $(rpc purge_expired_alumni_invites '{}')"
echo "idle drafts deleted: $(rpc purge_expired_drafts '{"p_days":90}')"
echo "returned/rejected posts deleted: $(rpc purge_rejected_experiences '{"p_days":90}')"
echo "deletion-ledger rows expired: $(rpc purge_deletion_ledger '{"p_days":30}')"

ids=$(curl -fsS "$URL/rest/v1/profiles?select=id&deletion_requested_at=not.is.null" "${H[@]}" | jq -r '.[].id')
done_n=0
failed_n=0
for id in $ids; do
  if rpc delete_account_data "{\"p_user\":\"$id\"}" > /dev/null &&
    curl -fsS -X DELETE "$URL/auth/v1/admin/users/$id" "${H[@]}" > /dev/null; then
    done_n=$((done_n + 1))
  else
    failed_n=$((failed_n + 1))
  fi
done
echo "account deletions completed: $done_n, failed: $failed_n"
# A failure (for example the last admin) is retried tomorrow; fail the run so someone looks.
[ "$failed_n" -eq 0 ]
