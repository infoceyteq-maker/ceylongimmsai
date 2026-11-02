import { NextResponse } from "next/server";
import { readArtifact } from "@/lib/office";
import { listArtifacts } from "@/lib/dept01-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

const TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  eml: "message/rfc822",
  ics: "text/calendar; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
};

/** Download a REAL locally generated artifact. No external storage involved. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(name) || name.includes("..")) {
    return NextResponse.json(
      { ok: false, error: "invalid or missing artifact name", available: listArtifacts().slice(0, 20).map((a) => a.name) },
      { status: 400, headers: NO_STORE },
    );
  }
  const buffer = readArtifact(name);
  if (!buffer) {
    return NextResponse.json({ ok: false, error: `artifact not found: ${name}` }, { status: 404, headers: NO_STORE });
  }
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = TYPES[extension] ?? "application/octet-stream";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      ...NO_STORE,
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename="${name}"`,
      "X-GIMMS-Origin": "local-native-file",
    },
  });
}
