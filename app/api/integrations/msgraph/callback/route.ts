import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { exchangeCodeForTokens, saveAccount } from "@/lib/integrations/msgraph";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  if (!code || !stateRaw) return new NextResponse("missing code/state", { status: 400 });

  let label: string;
  try {
    const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8")) as { label: string };
    label = parsed.label;
  } catch {
    return new NextResponse("invalid state", { status: 400 });
  }

  const redirectUri = `${url.origin}/api/integrations/msgraph/callback`;
  const tokens = await exchangeCodeForTokens(code, redirectUri);
  await saveAccount(label, tokens);
  return NextResponse.redirect(`${url.origin}/?connected=${encodeURIComponent(label)}`);
}
