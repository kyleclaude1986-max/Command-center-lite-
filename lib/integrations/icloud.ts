import ICAL from "ical.js";
import { createDAVClient } from "tsdav";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { calendarEvents } from "../db/schema";
import { env } from "../env";

export type IcloudAccountConfig = {
  label: string;
  username: string;
  appPassword: string;
  calendarName?: string;
};

export function icloudAccountsFromEnv(): IcloudAccountConfig[] {
  const out: IcloudAccountConfig[] = [];
  if (env.ICLOUD_A_USERNAME && env.ICLOUD_A_APP_PASSWORD) {
    out.push({
      label: env.ICLOUD_A_LABEL,
      username: env.ICLOUD_A_USERNAME,
      appPassword: env.ICLOUD_A_APP_PASSWORD,
      calendarName: env.ICLOUD_A_CALENDAR_NAME,
    });
  }
  if (env.ICLOUD_B_USERNAME && env.ICLOUD_B_APP_PASSWORD) {
    out.push({
      label: env.ICLOUD_B_LABEL,
      username: env.ICLOUD_B_USERNAME,
      appPassword: env.ICLOUD_B_APP_PASSWORD,
      calendarName: env.ICLOUD_B_CALENDAR_NAME,
    });
  }
  return out;
}

async function clientFor(a: IcloudAccountConfig) {
  return createDAVClient({
    serverUrl: "https://caldav.icloud.com",
    credentials: { username: a.username, password: a.appPassword },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
}

type ParsedOccurrence = {
  externalId: string;
  title: string;
  startsAt: number;
  endsAt: number;
  allDay: boolean;
  location: string | null;
};

function expandVEvent(vevent: ICAL.Component, windowStart: Date, windowEnd: Date): ParsedOccurrence[] {
  const event = new ICAL.Event(vevent);
  const uid = event.uid ?? String(Math.random());
  const result: ParsedOccurrence[] = [];

  if (event.isRecurring()) {
    const it = event.iterator();
    let next = it.next();
    const limit = ICAL.Time.fromJSDate(windowEnd, false);
    const start = ICAL.Time.fromJSDate(windowStart, false);
    while (next && next.compare(limit) < 0) {
      if (next.compare(start) >= 0) {
        const occ = event.getOccurrenceDetails(next);
        result.push({
          externalId: `${uid}::${next.toICALString()}`,
          title: event.summary ?? "(no title)",
          startsAt: Math.floor(occ.startDate.toJSDate().getTime() / 1000),
          endsAt: Math.floor(occ.endDate.toJSDate().getTime() / 1000),
          allDay: occ.startDate.isDate,
          location: event.location ?? null,
        });
      }
      next = it.next();
      if (result.length > 500) break;
    }
  } else {
    const startDate = event.startDate.toJSDate();
    const endDate = event.endDate.toJSDate();
    if (endDate >= windowStart && startDate <= windowEnd) {
      result.push({
        externalId: uid,
        title: event.summary ?? "(no title)",
        startsAt: Math.floor(startDate.getTime() / 1000),
        endsAt: Math.floor(endDate.getTime() / 1000),
        allDay: event.startDate.isDate,
        location: event.location ?? null,
      });
    }
  }
  return result;
}

function parseIcs(ics: string, windowStart: Date, windowEnd: Date): ParsedOccurrence[] {
  const jcal = ICAL.parse(ics);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");
  return vevents.flatMap((v) => expandVEvent(v, windowStart, windowEnd));
}

export async function syncIcloudCalendar(
  account: IcloudAccountConfig,
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  const client = await clientFor(account);
  const calendars = await client.fetchCalendars();
  const selected = account.calendarName
    ? calendars.filter((c) => c.displayName === account.calendarName)
    : calendars.filter((c) => Array.isArray(c.components) && c.components.includes("VEVENT"));
  if (selected.length === 0) {
    throw new Error(
      `iCloud: no calendar matched for ${account.label}. Available: ${calendars.map((c) => c.displayName).join(", ")}`,
    );
  }

  const all: ParsedOccurrence[] = [];
  for (const cal of selected) {
    const objects = await client.fetchCalendarObjects({
      calendar: cal,
      timeRange: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
    });
    for (const obj of objects) {
      if (!obj.data) continue;
      try {
        all.push(...parseIcs(obj.data, windowStart, windowEnd));
      } catch (err) {
        console.warn(`iCloud parse error on ${obj.url}:`, (err as Error).message);
      }
    }
  }

  const now = Math.floor(Date.now() / 1000);
  db.delete(calendarEvents)
    .where(and(eq(calendarEvents.source, "icloud"), eq(calendarEvents.calendarLabel, account.label)))
    .run();

  for (const occ of all) {
    db.insert(calendarEvents)
      .values({
        source: "icloud",
        calendarLabel: account.label,
        externalId: occ.externalId,
        title: occ.title,
        startsAt: occ.startsAt,
        endsAt: occ.endsAt,
        allDay: occ.allDay,
        location: occ.location,
        url: null,
        lastSyncedAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
  return all.length;
}
