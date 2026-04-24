import { and, asc, desc, gte, lt } from "drizzle-orm";
import { db } from "./db/client";
import { bloomTodos, calendarEvents, netsuiteMetrics, syncRuns } from "./db/schema";
import { addDays, endOfDay, startOfDay, startOfWeek } from "date-fns";

export type DashboardEvent = {
  id: number;
  source: string;
  calendarLabel: string;
  title: string;
  startsAt: number;
  endsAt: number;
  allDay: boolean;
  location: string | null;
};

export function getTodayEvents(now = new Date()): DashboardEvent[] {
  const start = Math.floor(startOfDay(now).getTime() / 1000);
  const end = Math.floor(endOfDay(now).getTime() / 1000);
  return db
    .select()
    .from(calendarEvents)
    .where(and(gte(calendarEvents.endsAt, start), lt(calendarEvents.startsAt, end)))
    .orderBy(asc(calendarEvents.startsAt))
    .all();
}

export function getWeekEvents(now = new Date()): DashboardEvent[] {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const start = Math.floor(weekStart.getTime() / 1000);
  const end = Math.floor(weekEnd.getTime() / 1000);
  return db
    .select()
    .from(calendarEvents)
    .where(and(gte(calendarEvents.endsAt, start), lt(calendarEvents.startsAt, end)))
    .orderBy(asc(calendarEvents.startsAt))
    .all();
}

export function getOpenTodos() {
  return db.select().from(bloomTodos).orderBy(asc(bloomTodos.dueAt)).all();
}

export function getMetrics(): { ytd: number | null; mtd: number | null; pipeline: number | null; asOf: number | null } {
  const rows = db.select().from(netsuiteMetrics).all();
  const map: Record<string, { value: string; asOf: number }> = {};
  for (const r of rows) map[r.metricKey] = { value: r.value, asOf: r.asOf };
  const parse = (v?: { value: string }) => (v ? Number(v.value) : null);
  const latestAsOf = rows.reduce((acc, r) => Math.max(acc, r.asOf), 0);
  return {
    ytd: parse(map.ytd_gross),
    mtd: parse(map.mtd_gross),
    pipeline: parse(map.pipeline),
    asOf: latestAsOf || null,
  };
}

export function getLastSyncBySource(): Record<string, { finishedAt: number | null; status: string }> {
  const rows = db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(50).all();
  const latest: Record<string, { finishedAt: number | null; status: string }> = {};
  for (const r of rows) {
    if (!latest[r.source]) latest[r.source] = { finishedAt: r.finishedAt, status: r.status };
  }
  return latest;
}
