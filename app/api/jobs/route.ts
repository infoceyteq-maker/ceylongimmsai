import { NextResponse } from "next/server";
import { requireOwnerWrite, authTag } from "@/lib/api-auth";
import { createJob, listJobs, jobsSummary, transitionJob } from "@/lib/jobs";
import { JOB_STATUSES } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** Read-only job list + real aggregate counts. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      phase: "P0-credential-free",
      storage: "local file (data/gimms-jobs.json) with in-memory fallback",
      statuses: JOB_STATUSES,
      jobs: listJobs(),
      summary: jobsSummary(),
    },
    { headers: NO_STORE },
  );
}

/**
 * Real job execution (not a UI response):
 *   action "create"     -> validate, route to a department, persist, write audit
 *   action "transition" -> validate status machine, persist, write audit
 * No external API, no payment, no posting, no production DB write.
 */
export async function POST(request: Request) {
  const auth = requireOwnerWrite(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "create").trim();

  if (action === "create") {
    const created = createJob(body);
    if (!created.ok) {
      return NextResponse.json({ ok: false, error: created.error }, { status: 400, headers: NO_STORE });
    }
    return NextResponse.json(
      {
        ok: true,
        ...authTag(auth),
        phase: "P0-credential-free",
        job: created.job,
        routing: created.job?.routing,
        persisted: created.persisted,
      },
      { status: 201, headers: NO_STORE },
    );
  }

  if (action === "transition") {
    const jobId = String(body.jobId ?? "").trim();
    const to = String(body.to ?? "").trim();
    if (!jobId || !to) {
      return NextResponse.json(
        { ok: false, error: "jobId and to are required" },
        { status: 400, headers: NO_STORE },
      );
    }
    const moved = transitionJob(jobId, to);
    if (!moved.ok) {
      return NextResponse.json({ ok: false, error: moved.error }, { status: 400, headers: NO_STORE });
    }
    return NextResponse.json(
      { ok: true, ...authTag(auth), job: moved.job, persisted: moved.persisted },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json(
    { ok: false, error: `unknown action: ${action}` },
    { status: 400, headers: NO_STORE },
  );
}
