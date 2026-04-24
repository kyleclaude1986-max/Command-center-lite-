import { addDays, startOfDay, startOfWeek } from "date-fns";
import { db } from "../db/client";
import { syncRuns } from "../db/schema";
import { eq } from "drizzle-orm";
import { icloudAccountsFromEnv, syncIcloudCalendar } from "../integrations/icloud";
import { listMsgraphAccounts, syncMsgraphCalendar } from "../integrations/msgraph";
import { syncBloomTodos } from "../integrations/bloom";
import { syncNetsuite } from "../integrations/netsuite";

function weekWindow(): { start: Date; end: Date } {
  const today = startOfDay(new Date());
  const start = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const end = addDays(start, 14); // two-week lookahead buffer
  return { start, end };
}

async function run(source: string, fn: () => Promise<number | void>): Promise<void> {
  const inserted = db.insert(syncRuns).values({ source, status: "running" }).run();
  const id = Number(inserted.lastInsertRowid);
  try {
    const items = await fn();
    db.update(syncRuns)
      .set({
        finishedAt: Math.floor(Date.now() / 1000),
        status: "ok",
        itemsWritten: typeof items === "number" ? items : 0,
      })
      .where(eq(syncRuns.id, id))
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sync:${source}]`, message);
    db.update(syncRuns)
      .set({
        finishedAt: Math.floor(Date.now() / 1000),
        status: "error",
        error: message.slice(0, 1000),
      })
      .where(eq(syncRuns.id, id))
      .run();
  }
}

export async function syncAll(): Promise<void> {
  const { start, end } = weekWindow();
  const tasks: Array<Promise<void>> = [];

  for (const label of listMsgraphAccounts()) {
    tasks.push(run(`msgraph:${label}`, () => syncMsgraphCalendar(label, start, end)));
  }
  for (const acct of icloudAccountsFromEnv()) {
    tasks.push(run(`icloud:${acct.label}`, () => syncIcloudCalendar(acct, start, end)));
  }
  tasks.push(run("bloom", () => syncBloomTodos()));
  tasks.push(run("netsuite", () => syncNetsuite().then((m) => 3)));

  await Promise.allSettled(tasks);
}

export async function syncOne(source: string): Promise<void> {
  const { start, end } = weekWindow();

  if (source === "netsuite") return run("netsuite", () => syncNetsuite().then(() => 3));
  if (source === "bloom") return run("bloom", () => syncBloomTodos());

  if (source.startsWith("msgraph:")) {
    const label = source.slice("msgraph:".length);
    return run(`msgraph:${label}`, () => syncMsgraphCalendar(label, start, end));
  }
  if (source.startsWith("icloud:")) {
    const label = source.slice("icloud:".length);
    const acct = icloudAccountsFromEnv().find((a) => a.label === label);
    if (!acct) throw new Error(`Unknown iCloud account label: ${label}`);
    return run(`icloud:${label}`, () => syncIcloudCalendar(acct, start, end));
  }

  throw new Error(`Unknown sync source: ${source}`);
}
