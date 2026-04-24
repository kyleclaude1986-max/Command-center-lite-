import "server-only";
import { startScheduler } from "./scheduler";

if (process.env.DISABLE_SCHEDULER !== "1") {
  startScheduler();
}
