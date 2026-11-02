#!/usr/bin/env bash
# Verifies the LIVE AI GIMMS Hub from a machine with normal outbound HTTPS.
# Run by .github/workflows/verify-live.yml (the sandbox itself cannot reach vercel.app).
set -u
BASE="${BASE:-https://ai-gimms-hub.vercel.app}"
echo "BASE=$BASE"

printf '/ %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
for p in /tasks /approvals /clients /agents /status /research /publishing /audience /connections /callcenter /memory /production; do
  printf '%s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"
done

echo "--- bootstrap ---"
curl -s "$BASE/api/bootstrap" | grep -o '"storage":"[a-z]*"'
curl -s "$BASE/api/bootstrap" | grep -o '"counts":{[^}]*}'
printf 'logo-512.png %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/logo-512.png")"
printf 'scene3d_count %s\n' "$(curl -s "$BASE/" | grep -c 'class="scene3d"')"
printf 'api/connect %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/connect")"
curl -s "$BASE/api/connect" | head -c 260
echo

echo "--- create one task on the live site ---"
TITLE="Live verification $(date -u +%Y%m%dT%H%M%SZ)"
curl -s -X POST -H 'Content-Type: application/json' --data "{\"title\":\"$TITLE\"}" "$BASE/api/tasks"
echo

echo "--- reload: prove it is the DB, not memory ---"
printf 'title=%s\n' "$TITLE"
printf 'bootstrap_counts %s\n' "$(curl -s "$BASE/api/bootstrap" | grep -o '"counts":{[^}]*}')"
printf 'task_present_after_reload %s\n' "$(curl -s "$BASE/api/tasks" | grep -c "$TITLE")"
curl -s "$BASE/api/tasks" | head -c 260
echo
