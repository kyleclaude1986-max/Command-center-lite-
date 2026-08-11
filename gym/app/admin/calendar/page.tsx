import { CalendarSettings } from "@/components/admin/CalendarSettings";
import { isElevated } from "@/lib/admin-auth";
import { calendarConfigured, calendarName, listCalendars } from "@/lib/calendar/caldav";
import { lastSyncRun, pendingPushCount, scannedCalendarNames } from "@/lib/calendar/sync";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminCalendarPage() {
  if (!(await isElevated())) return null;

  const configured = calendarConfigured();

  let available: string[] = [];
  let discoveryError: string | null = null;

  if (configured) {
    try {
      available = (await listCalendars()).map(calendarName).filter(Boolean);
    } catch (error) {
      discoveryError = error instanceof Error ? error.message : "could not reach iCloud";
    }
  }

  const run = lastSyncRun();

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Calendar</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Two-way. Workouts you log are written out to a dedicated calendar, and classes
          you have booked elsewhere are read in as things to confirm.
        </p>
      </header>

      <CalendarSettings
        configured={configured}
        workoutCalendarName={env.ICLOUD_WORKOUT_CALENDAR_NAME}
        available={available}
        scanned={scannedCalendarNames()}
        discoveryError={discoveryError}
        pendingPush={pendingPushCount()}
        lastRun={
          run
            ? { status: run.status, error: run.error, finishedAt: run.finishedAt }
            : null
        }
      />
    </div>
  );
}
