import cron from "node-cron";
import { env } from "../env";
import { syncAll } from "./sources";

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;
  console.log(`[scheduler] registering cron '${env.SYNC_CRON}'`);
  cron.schedule(env.SYNC_CRON, () => {
    syncAll().catch((e) => console.error("[scheduler] syncAll failed:", e));
  });
  // Kick off one sync shortly after boot so the dashboard isn't empty
  setTimeout(() => {
    syncAll().catch((e) => console.error("[scheduler] initial syncAll failed:", e));
  }, 5_000);
}
