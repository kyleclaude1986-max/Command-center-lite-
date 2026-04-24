import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncAll, syncOne } from "@/lib/sync/sources";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const source = url.searchParams.get("source");
  if (source) {
    await syncOne(source);
  } else {
    await syncAll();
  }
  return NextResponse.json({ ok: true });
}
