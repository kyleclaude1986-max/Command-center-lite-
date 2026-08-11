import { NextResponse } from "next/server";
import { asString, readJson, requireSession } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { ELEVATION_COOKIE, createElevationToken } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await readJson(request);
  const password = asString(body.password);
  if (!password || !(await verifyPassword(password))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = createElevationToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ELEVATION_COOKIE, token.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: token.maxAge,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ELEVATION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
