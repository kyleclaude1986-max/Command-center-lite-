import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { calendarEvents, oauthAccounts } from "../db/schema";
import { decrypt, encrypt } from "../crypto";
import { requireEnv } from "../env";

const GRAPH = "https://graph.microsoft.com/v1.0";

export const MSGRAPH_SCOPES = ["offline_access", "Calendars.Read", "User.Read"];

export function authorizeUrl(redirectUri: string, state: string): string {
  const tenant = requireEnv("MS_TENANT_ID");
  const clientId = requireEnv("MS_CLIENT_ID");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MSGRAPH_SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
};

async function exchangeToken(body: Record<string, string>): Promise<TokenResponse> {
  const tenant = requireEnv("MS_TENANT_ID");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`MS token ${res.status}: ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
  return exchangeToken({
    client_id: requireEnv("MS_CLIENT_ID"),
    client_secret: requireEnv("MS_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    scope: MSGRAPH_SCOPES.join(" "),
  });
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return exchangeToken({
    client_id: requireEnv("MS_CLIENT_ID"),
    client_secret: requireEnv("MS_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MSGRAPH_SCOPES.join(" "),
  });
}

export async function saveAccount(label: string, tokens: TokenResponse, externalUserId?: string): Promise<void> {
  const expires = Math.floor(Date.now() / 1000) + tokens.expires_in - 60;
  const existing = db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, "msgraph"), eq(oauthAccounts.accountLabel, label)))
    .get();

  const refreshPlain = tokens.refresh_token ?? (existing ? decrypt(existing.encryptedRefreshToken) : undefined);
  if (!refreshPlain) throw new Error(`No refresh_token returned and no existing token for '${label}'`);

  const row = {
    provider: "msgraph" as const,
    accountLabel: label,
    externalUserId,
    encryptedRefreshToken: encrypt(refreshPlain),
    encryptedAccessToken: encrypt(tokens.access_token),
    accessTokenExpiresAt: expires,
    scope: tokens.scope,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  if (existing) {
    db.update(oauthAccounts).set(row).where(eq(oauthAccounts.id, existing.id)).run();
  } else {
    db.insert(oauthAccounts).values(row).run();
  }
}

async function accessTokenFor(label: string): Promise<string> {
  const acct = db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, "msgraph"), eq(oauthAccounts.accountLabel, label)))
    .get();
  if (!acct) throw new Error(`No msgraph account configured for label '${label}'`);
  const now = Math.floor(Date.now() / 1000);
  if (acct.encryptedAccessToken && acct.accessTokenExpiresAt && acct.accessTokenExpiresAt > now + 30) {
    return decrypt(acct.encryptedAccessToken);
  }
  const refresh = decrypt(acct.encryptedRefreshToken);
  const tokens = await refreshAccessToken(refresh);
  await saveAccount(label, tokens, acct.externalUserId ?? undefined);
  return tokens.access_token;
}

// --- Calendar fetch ---

type GraphEvent = {
  id: string;
  subject?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  webLink?: string;
};

export async function fetchEvents(label: string, windowStart: Date, windowEnd: Date): Promise<GraphEvent[]> {
  const token = await accessTokenFor(label);
  const url =
    `${GRAPH}/me/calendarView?` +
    new URLSearchParams({
      startDateTime: windowStart.toISOString(),
      endDateTime: windowEnd.toISOString(),
      $top: "200",
      $orderby: "start/dateTime",
    });
  const events: GraphEvent[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    });
    if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { value: GraphEvent[]; "@odata.nextLink"?: string };
    events.push(...json.value);
    next = json["@odata.nextLink"] ?? null;
  }
  return events;
}

function toUnix(dt: string): number {
  // Graph returns ISO without 'Z' when Prefer header sets UTC; ensure we parse as UTC.
  const iso = dt.endsWith("Z") ? dt : dt + "Z";
  return Math.floor(new Date(iso).getTime() / 1000);
}

export async function syncMsgraphCalendar(label: string, windowStart: Date, windowEnd: Date): Promise<number> {
  const events = await fetchEvents(label, windowStart, windowEnd);
  const now = Math.floor(Date.now() / 1000);

  db.delete(calendarEvents)
    .where(and(eq(calendarEvents.source, "msgraph"), eq(calendarEvents.calendarLabel, label)))
    .run();

  for (const e of events) {
    db.insert(calendarEvents)
      .values({
        source: "msgraph",
        calendarLabel: label,
        externalId: e.id,
        title: e.subject ?? "(no title)",
        startsAt: toUnix(e.start.dateTime),
        endsAt: toUnix(e.end.dateTime),
        allDay: Boolean(e.isAllDay),
        location: e.location?.displayName ?? null,
        url: e.webLink ?? null,
        lastSyncedAt: now,
      })
      .run();
  }
  return events.length;
}

export function listMsgraphAccounts(): string[] {
  return db
    .select({ label: oauthAccounts.accountLabel })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.provider, "msgraph"))
    .all()
    .map((r) => r.label);
}
