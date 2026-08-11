import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { badRequest, ok } from "@/lib/api";
import { env } from "@/lib/env";
import { ingest } from "@/lib/health/ingest";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * This is the one endpoint without a session — Health Auto Export runs on the phone
 * and posts unattended, so it carries a bearer token instead. Compared in constant
 * time so a wrong token cannot be narrowed down a character at a time.
 */
function authorized(request: Request): boolean {
  const expected = env.HEALTH_INGEST_TOKEN;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (presented.length === 0) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!env.HEALTH_INGEST_TOKEN) {
    return NextResponse.json({ error: "ingest is not configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const text = await request.text();
  if (text.length === 0) return badRequest("empty body");
  if (text.length > MAX_BODY_BYTES) return badRequest("payload too large");

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return badRequest("body was not valid JSON");
  }

  try {
    const result = ingest(payload, text);
    return ok(result as unknown as Record<string, unknown>);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "could not apply that export" },
      { status: 500 }
    );
  }
}
