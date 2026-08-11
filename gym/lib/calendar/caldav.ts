import { createDAVClient, type DAVCalendar } from "tsdav";
import { env } from "../env";

const ICLOUD_URL = "https://caldav.icloud.com";

export type CalDavClient = Awaited<ReturnType<typeof createDAVClient>>;

let cached: CalDavClient | null = null;

export function calendarConfigured(): boolean {
  return Boolean(env.ICLOUD_USERNAME && env.ICLOUD_APP_PASSWORD);
}

export async function client(): Promise<CalDavClient> {
  if (!calendarConfigured()) {
    throw new Error("iCloud is not configured — set ICLOUD_USERNAME and ICLOUD_APP_PASSWORD");
  }
  if (cached) return cached;

  cached = await createDAVClient({
    serverUrl: ICLOUD_URL,
    credentials: { username: env.ICLOUD_USERNAME!, password: env.ICLOUD_APP_PASSWORD! },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });

  return cached;
}

export function resetClient(): void {
  cached = null;
}

function supportsEvents(calendar: DAVCalendar): boolean {
  const components = calendar.components ?? [];
  return components.length === 0 || components.includes("VEVENT");
}

export function calendarName(calendar: DAVCalendar): string {
  const raw = calendar.displayName;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "_cdata" in raw) return String(raw._cdata ?? "");
  return "";
}

export async function listCalendars(): Promise<DAVCalendar[]> {
  const dav = await client();
  return (await dav.fetchCalendars()).filter(supportsEvents);
}

/**
 * The Workouts calendar has to already exist. Creating calendars over CalDAV is
 * inconsistently supported and iCloud in particular is fussy about it — a clear
 * error telling Kyle to make the calendar in the Calendar app is more useful than
 * a half-working MKCALENDAR that produces a calendar his phone will not show.
 */
export async function workoutCalendar(): Promise<DAVCalendar> {
  const wanted = env.ICLOUD_WORKOUT_CALENDAR_NAME.trim().toLowerCase();
  const calendars = await listCalendars();

  const found = calendars.find((c) => calendarName(c).trim().toLowerCase() === wanted);
  if (found) return found;

  const available = calendars.map(calendarName).filter(Boolean).join(", ");
  throw new Error(
    `no calendar named "${env.ICLOUD_WORKOUT_CALENDAR_NAME}" on that Apple ID. ` +
      `Create it in the Calendar app first. Available: ${available || "none"}`
  );
}
