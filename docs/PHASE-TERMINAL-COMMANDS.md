# Terminal commands — GitHub Codespaces only (bash)

Your Windows machine cannot run PowerShell, Node or the CLI. **Every command on this
page runs in GitHub Codespaces in your browser.** Nothing here installs anything on
your machine, and nothing here is PowerShell.

## Open a terminal (no local setup)

1. Go to `github.com/infoceyteq-maker/ceylongimmsai`
2. Press **`.`** (period) — or **Code ▾ → Codespaces → Create codespace on main**
3. Wait for the container (first run ~60 s; `postCreateCommand` runs `npm install`)
4. **Terminal → New Terminal.** You now have bash on Linux.

`.devcontainer/devcontainer.json` in this repo pre-configures Node 22, the GitHub CLI,
Docker, port forwarding for 3000 and 8080, and sets bash as the default profile. That
file is the whole fix for "my local machine is broken": the workspace is disposable and
rebuildable, and losing it costs nothing.

---

## 1. Verify the repository is healthy

```bash
cd /workspaces/ceylongimmsai     # adjust if your Codespaces checkout is elsewhere
npm ci
npx tsc --noEmit                # expect: no output
npx next build                  # expect: exit 0
```

## 2. Run the app locally

```bash
npm run dev
# Codespaces auto-forwards :3000 — the Ports tab shows a public https URL.
# Stop with Ctrl+C.
```

## 3. Run every verification harness

```bash
npm run dev > /tmp/dev.log 2>&1 &
sleep 8

BASE=http://localhost:3000 node scripts/verify-phase0.sh
BASE=http://localhost:3000 node scripts/verify-developer-team-ci.mjs
BASE=http://localhost:3000 node scripts/verify-dept01.mjs
BASE=http://localhost:3000 node scripts/verify-owner-chat.mjs
BASE=http://localhost:3000 node scripts/verify-agent.mjs

kill %1
```

## 4. Check dependencies for known vulnerabilities

```bash
npm audit --omit=dev     # read the real output; do not trust a summary
```

## 5. Deploy the agent worker (Phase 2)

```bash
curl -L https://fly.io/install.sh | sh
export FLYCTL_INSTALL="/home/codespace/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"
fly auth login

cd agent-worker
fly launch --no-deploy --copy-config --name gimms-agent-worker

SECRET=$(openssl rand -hex 32)
echo "AGENT_WORKER_SECRET=$SECRET"       # copy this into Vercel too
fly secrets set WORKER_SECRET="$SECRET"
fly deploy

curl -s https://gimms-agent-worker.fly.dev/health
```

Then in the **Vercel web UI** (no terminal needed): Settings → Environment Variables →
add `AGENT_WORKER_URL`, `AGENT_WORKER_SECRET`, `GIMMS_PUBLIC_URL`,
`OWNER_BOOTSTRAP_TOKEN` for Production **and** Preview → Deployments → Redeploy.

## 6. Apply the Supabase schema (web UI, no terminal)

Supabase dashboard → your project → **SQL Editor** → New query → paste
`supabase/agent-schema.sql` → **Run**. Verify with the commented `select` at the bottom
of that file: both tables must show `rowsecurity = true`.

## 7. Generate secrets without ever displaying them in a log

```bash
openssl rand -hex 32                 # 64 hex chars — good for all *_TOKEN / *_SECRET vars
```

Paste straight into Vercel's environment-variable field. Never into chat, an issue, a
commit, or this file.

## 8. If the dev server or build behaves oddly

```bash
rm -rf .next node_modules
npm ci
npx next build
```

That is the Codespaces equivalent of "turn it off and on again" — and it is free,
because the container is disposable.

## 9. What NOT to run

These are deliberately **not** provided, because they do not apply to your environment
or would be unsafe:

- any PowerShell / `pwsh` / `.ps1` command — your shell is bash
- `npm install <package>` to "fix" a build — this project is intentional about its
  5 dependencies; adding one needs a written reason
- `git push --force`, `git reset --hard` on a shared branch
- anything that prints an environment variable's **value** (`env`, `printenv`, `echo $KEY`)
  — use `[ -n "$KEY" ] && echo present` when you only need to know whether it is set
- `curl` against `/api/admin/*` without a session cookie — it will (correctly) return 401
