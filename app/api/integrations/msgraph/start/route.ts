import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeUrl } from "@/lib/integrations/msgraph";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const label = url.searchParams.get("label");
  if (!label) return new NextResponse("missing ?label= (e.g. 'Work A')", { status: 400 });

  const redirectUri = `${url.origin}/api/integrations/msgraph/callback`;
  const state = Buffer.from(JSON.stringify({ label, ts: Date.now() })).toString("base64url");
  return NextResponse.redirect(authorizeUrl(redirectUri, state));
}
