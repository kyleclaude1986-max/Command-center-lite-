import cron from "node-cron";
import { env } from "../env";
import { calendarConfigured } from "./caldav";
import { runCalendarSync } from "./sync";

let started = false;

/**
 * Started lazily from a server component rather than instrumentation.ts. Putting it
 * in instrumentation bundles it for the edge runtime, which cannot load
 * better-sqlite3 and breaks the build.
 */
export function startScheduler(): void {
  if (started) return;
  if (env.DISABLE_SCHEDULER) return;
  if (!calendarConfigured()) return;
  if (!cron.validate(env.SYNC_CRON)) {
    console.warn(`SYNC_CRON is not a valid expression: ${env.SYNC_CRON}`);
    return;
  }

  started = true;

  cron.schedule(env.SYNC_CRON, () => {
    void runCalendarSync().catch((error) => {
      console.error("calendar sync failed", error);
    });
  });
}
