import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/owner-auth";
import { eventsSince, chatSnapshot } from "@/lib/chat-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * REAL Server-Sent Events stream of persisted progress events.
 * Emits ONLY events that were actually written by real chat execution.
 * No fabricated heartbeat "results", no simulated AI activity.
 */
export async function GET(request: Request) {
  const auth = requireOwner(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const url = new URL(request.url);
  const sinceParam = Number(url.searchParams.get("since") ?? "0");
  let cursor = Number.isFinite(sinceParam) && sinceParam >= 0 ? Math.floor(sinceParam) : 0;
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const MAX_LIFETIME_MS = 120_000;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let ticks = 0;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      send(`event: ready\ndata: ${JSON.stringify({ ok: true, cursor, lastEventSequence: chatSnapshot(1).lastEventSequence, owner: auth.profile.employeeId, note: "Real persisted events only" })}\n\n`);

      const timer = setInterval(() => {
        if (closed) return;
        ticks += 1;
        try {
          const fresh = eventsSince(cursor);
          for (const item of fresh) {
            send(`id: ${item.sequence}\nevent: ${item.level}\ndata: ${JSON.stringify(item)}\n\n`);
            cursor = item.sequence;
          }
          if (ticks % 40 === 0) send(`: heartbeat ${new Date().toISOString()}\n\n`);
        } catch {
          close();
          return;
        }
        if (Date.now() - startedAt > MAX_LIFETIME_MS) {
          send(`event: reconnect\ndata: ${JSON.stringify({ cursor, note: "Stream lifetime reached; EventSource will reconnect." })}\n\n`);
          close();
        }
      }, 250);

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
