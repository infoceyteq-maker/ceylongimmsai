#!/usr/bin/env bash
# GIMMS Phase 0 — LOCAL verification of real job execution and safe internal skills.
# Usage: bash scripts/verify-phase0.sh 2>&1 | tee phase0-verification.txt
# No deploy, no external API, no purchase, no production data change.
set -u
BASE="${BASE:-http://127.0.0.1:3000}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

echo "PHASE0_BASE=$BASE"
echo "PHASE0_STAMP=$STAMP"
echo "--- 14 pages (13 existing + /departments) ---"
for p in / /tasks /approvals /clients /agents /departments /status /research /publishing /audience /connections /callcenter /memory /production; do
  printf '%s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"
done

echo "--- department registry ---"
DEPTS="$(curl -s "$BASE/api/departments")"
printf '%s' "$DEPTS" | grep -o '"summary":{[^}]*}'
printf '%s' "$DEPTS" | grep -o '"status":"active-p0"' | wc -l | sed 's/^/active_p0_count /'
printf '%s' "$DEPTS" | grep -o '"status":"deferred"' | wc -l | sed 's/^/deferred_count /'

echo "--- safe internal skills catalogue ---"
SKILLS_JSON="$(curl -s "$BASE/api/skills")"
printf '%s' "$SKILLS_JSON" | grep -o '"summary":{[^}]*}'
SKILL_IDS="$(printf '%s' "$SKILLS_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log((j.skills||[]).map(x=>x.id).join(' '))})")"

echo "--- create a real job for skills that need one ---"
HARNESS="$(curl -s -X POST -H 'Content-Type: application/json' --data "{\"action\":\"create\",\"title\":\"Phase 0 skill harness $STAMP\",\"departmentId\":\"10\"}" "$BASE/api/jobs")"
SKILL_JOB_ID="$(printf '%s' "$HARNESS" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.job?.jobId||'')})")"
echo "skill_harness_job_id=$SKILL_JOB_ID"

echo "--- execute EVERY skill (real deterministic work, evidence hash) ---"
SKILL_OK=0
SKILL_FAIL=0
for id in $SKILL_IDS; do
  RES="$(curl -s -X POST -H 'Content-Type: application/json' --data "{\"skillId\":\"$id\",\"payload\":{\"title\":\"Phase 0 verification $STAMP\",\"text\":\"Market research report on competitor pricing\",\"sources\":[{\"name\":\"Master Architecture v1.3\",\"url\":\"\"}],\"lines\":[{\"description\":\"QA item\",\"qty\":2,\"unitPrice\":5}],\"jobId\":\"$SKILL_JOB_ID\",\"to\":\"REVIEW\"}}" "$BASE/api/skills")"
  OK="$(printf '%s' "$RES" | grep -c '"ok":true' || true)"
  SHA="$(printf '%s' "$RES" | grep -o '"sha256":"[a-f0-9]*"' | tail -1 | cut -c11-26)"
  if [ "$OK" = "1" ]; then SKILL_OK=$((SKILL_OK+1)); else SKILL_FAIL=$((SKILL_FAIL+1)); fi
  printf 'skill %-24s ok=%s sha=%s\n' "$id" "$OK" "${SHA:-none}"
done
echo "skill_executed_ok=$SKILL_OK"
echo "skill_failed=$SKILL_FAIL"

echo "--- create + route + persist a real job (explicit department) ---"
CREATE="$(curl -s -X POST -H 'Content-Type: application/json' --data "{\"action\":\"create\",\"title\":\"Phase 0 explicit job $STAMP\",\"departmentId\":\"10\"}" "$BASE/api/jobs")"
printf '%s\n' "$CREATE" | head -c 420
echo
JOB_ID="$(printf '%s' "$CREATE" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.job?.jobId||'')})")"
echo "created_job_id=$JOB_ID"

echo "--- keyword routing (no departmentId) ---"
AUTO="$(curl -s -X POST -H 'Content-Type: application/json' --data "{\"action\":\"create\",\"title\":\"Market research report for Q4 $STAMP\"}" "$BASE/api/jobs")"
printf '%s' "$AUTO" | grep -o '"routing":{"id":"[0-9]*","basis":"[a-z]*","matchedKeywords":\[[^]]*\]' || true
printf '%s' "$AUTO" | grep -o '"department":"[0-9]*"' | head -1

echo "--- invalid routing is rejected (deferred department) ---"
curl -s -X POST -H 'Content-Type: application/json' --data '{"action":"create","title":"should fail","departmentId":"06"}' "$BASE/api/jobs" | head -c 200
echo

echo "--- status transition (real state machine) ---"
TRANS="$(curl -s -X POST -H 'Content-Type: application/json' --data "{\"action\":\"transition\",\"jobId\":\"$JOB_ID\",\"to\":\"REVIEW\"}" "$BASE/api/jobs")"
printf '%s' "$TRANS" | grep -o '"status":"[A-Z_]*"' | head -1
echo "--- illegal transition is rejected ---"
curl -s -X POST -H 'Content-Type: application/json' --data "{\"action\":\"transition\",\"jobId\":\"$JOB_ID\",\"to\":\"COMPLETE\"}" "$BASE/api/jobs" | head -c 200
echo

echo "--- reload: prove the job was persisted, not just returned ---"
printf 'job_present_after_reload %s\n' "$(curl -s "$BASE/api/jobs" | grep -c "Phase 0 explicit job $STAMP")"
curl -s "$BASE/api/jobs" | grep -o '"summary":{[^}]*}' | head -c 400
echo
echo "--- local connection state stays honest ---"
curl -s "$BASE/api/connect" | grep -o '"connected":[0-9]\+' | head -1
echo "PHASE0_VERIFICATION_DONE=$STAMP"
