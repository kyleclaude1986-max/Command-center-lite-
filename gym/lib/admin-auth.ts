import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "./env";
import { requireSession } from "./api";

export const ELEVATION_COOKIE = "gym_admin";
const ELEVATION_TTL_SECONDS = 60 * 60 * 2;

function secret(): string {
  if (!env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is not set");
  return env.NEXTAUTH_SECRET;
}

function sign(expiresAt: number): string {
  return createHmac("sha256", secret()).update(`admin:${expiresAt}`).digest("base64url");
}

export function createElevationToken(): { value: string; maxAge: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + ELEVATION_TTL_SECONDS;
  return { value: `${expiresAt}.${sign(expiresAt)}`, maxAge: ELEVATION_TTL_SECONDS };
}

export function verifyElevationToken(token: string | undefined): boolean {
  if (!token) return false;
  const [rawExpiry, signature] = token.split(".");
  if (!rawExpiry || !signature) return false;

  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(sign(expiresAt));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function isElevated(): Promise<boolean> {
  const store = await cookies();
  return verifyElevationToken(store.get(ELEVATION_COOKIE)?.value);
}

export async function requireElevated(): Promise<Response | null> {
  const denied = await requireSession();
  if (denied) return denied;
  if (!(await isElevated())) {
    return NextResponse.json({ error: "elevation required" }, { status: 401 });
  }
  return null;
}
