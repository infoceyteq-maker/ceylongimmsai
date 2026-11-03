#!/usr/bin/env bash
# Verifies the LIVE AI GIMMS Hub from a machine with normal outbound HTTPS.
# Run by .github/workflows/verify-live.yml (from GitHub Codespaces you can also run:
#   BASE=https://ai-gimms-hub.vercel.app bash scripts/verify-live.sh
# )
#
# Phase 1 additions: security-header assertions. These FAIL LOUDLY if the middleware
# is not deployed, which is exactly the regression that matters after hardening.

set -u
BASE="${BASE:-https://ai-gimms-hub.vercel.app}"
FAILED=0

say() { printf '%s\n' "$*"; }
fail() { FAILED=$((FAILED + 1)); say "FAIL | $*"; }
pass() { say "PASS | $*"; }

say "BASE=$BASE"
say ""

say "--- 1. Pages ---"
for p in / /tasks /approvals /clients /agents /status /research /publishing /audience /connections /callcenter /memory /production /chat; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"
  if [ "$CODE" = "200" ]; then pass "page $p $CODE"; else fail "page $p $CODE"; fi
done

say ""
say "--- 2. Security headers (Phase 1) ---"
HEADERS="$(curl -sS -D - -o /dev/null "$BASE/")"
assert_header() {
  if printf '%s' "$HEADERS" | grep -qi "^$1:"; then pass "header $1 present"; else fail "header $1 MISSING"; fi
}
assert_header "Content-Security-Policy"
assert_header "X-Content-Type-Options"
assert_header "Referrer-Policy"
assert_header "Permissions-Policy"
assert_header "Strict-Transport-Security"

if printf '%s' "$HEADERS" | grep -qi "x-powered-by: next.js"; then
  fail "X-Powered-By leaks the framework version"
else
  pass "X-Powered-By absent"
fi

CSP="$(printf '%s' "$HEADERS" | grep -i '^content-security-policy:' | head -1)"
case "$CSP" in
  *"frame-ancestors"*) pass "CSP sets frame-ancestors" ;;
  *) fail "CSP has no frame-ancestors" ;;
esac

say ""
say "--- 3. Data exposure ---"
BOOTSTRAP="$(curl -s "$BASE/api/bootstrap")"
say "$BOOTSTRAP" | grep -o '"storage":"[a-z]*"'
if say "$BOOTSTRAP" | grep -q '"authenticated":false'; then
  pass "anonymous bootstrap is not authenticated"
else
  fail "anonymous bootstrap does not report authenticated:false"
fi
if say "$BOOTSTRAP" | grep -q '"redacted":\["clients","audit"\]'; then
  pass "anonymous bootstrap redacts clients + audit"
else
  fail "anonymous bootstrap is NOT redacting clients/audit"
fi
if say "$BOOTSTRAP" | grep -q '"clients":\['; then
  fail "anonymous bootstrap still returns the clients array"
else
  pass "clients array absent from anonymous bootstrap"
fi
if say "$BOOTSTRAP" | grep -q '"audit":\['; then
  fail "anonymous bootstrap still returns the audit array"
else
  pass "audit array absent from anonymous bootstrap"
fi

say ""
say "--- 4. Auth gates (must be 401/403, never 201/200) ---"
gate() {
  local method="$1" path="$2" expect="$3"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" -H 'Content-Type: application/json' -d '{}' "$BASE$path")"
  if [ "$code" = "$expect" ]; then pass "$method $path -> $code"; else fail "$method $path -> $code (expected $expect)"; fi
}
gate POST /api/tasks 401
gate POST /api/jobs 401
gate POST /api/skills 401
gate POST /api/dept01 401
gate POST /api/developer-team 401
gate POST /api/production/ai-team 401
gate GET /api/admin/agent 401

say ""
say "--- 5. CSRF guard (cross-origin POST must be 403) ---"
# NON-WRITING PROBE: send an empty JSON object, never a valid task title.
# On a hardened build the CSRF guard rejects before validation (403).
# On a stale/unprotected build this fails validation (400) instead of creating
# a real task record. Either way the monitor must not write business data.
CSRF_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://evil.example' \
  -d '{}' \
  "$BASE/api/tasks")"
if [ "$CSRF_CODE" = "403" ]; then pass "cross-origin POST /api/tasks -> 403"; else fail "cross-origin POST /api/tasks -> $CSRF_CODE (expected 403)"; fi

say ""
say "--- 6. Static assets ---"
printf 'logo-512.png %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/logo-512.png")"
say "robots.txt:"
curl -s "$BASE/robots.txt" | head -5

say ""
say "--- 7. /admin gate ---"
ADMIN_CODE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/auto-pilot")"
if [ "$ADMIN_CODE" = "307" ] || [ "$ADMIN_CODE" = "308" ] || [ "$ADMIN_CODE" = "302" ]; then
  pass "anonymous /admin/auto-pilot redirects to login ($ADMIN_CODE)"
else
  fail "anonymous /admin/auto-pilot -> $ADMIN_CODE (expected a redirect to /admin/login)"
fi

say ""
if [ "$FAILED" -eq 0 ]; then
  say "LIVE_VERIFY_RESULT=PASS (0 failures)"
  exit 0
fi
say "LIVE_VERIFY_RESULT=FAIL ($FAILED failed checks)"
exit 1
