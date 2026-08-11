import { badRequest, ok, readJson, requireSession } from "@/lib/api";
import { calendarConfigured, listCalendars, calendarName } from "@/lib/calendar/caldav";
import { resyncAll, runCalendarSync, setScannedCalendars } from "@/lib/calendar/sync";

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  if (!calendarConfigured()) {
    return badRequest("iCloud is not set up yet — add ICLOUD_USERNAME and ICLOUD_APP_PASSWORD");
  }

  const body = await readJson(request);

  if (body.resyncAll === true) {
    const queued = resyncAll();
    const outcome = await runCalendarSync();
    return ok({ queued, ...outcome } as unknown as Record<string, unknown>);
  }

  if (Array.isArray(body.scannedCalendars)) {
    const names = body.scannedCalendars.filter((n): n is string => typeof n === "string");
    setScannedCalendars(names);
  }

  const outcome = await runCalendarSync();
  return ok(outcome as unknown as Record<string, unknown>);
}

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  if (!calendarConfigured()) return ok({ configured: false, calendars: [] });

  try {
    const calendars = (await listCalendars()).map(calendarName).filter(Boolean);
    return ok({ configured: true, calendars });
  } catch (error) {
    return ok({
      configured: true,
      calendars: [],
      error: error instanceof Error ? error.message : "could not reach iCloud",
    });
  }
}
