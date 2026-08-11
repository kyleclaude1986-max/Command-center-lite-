import ICAL from "ical.js";
import { formatInTimeZone } from "date-fns-tz";
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { db } from "../db/client";
import {
  exercises,
  exerciseSets,
  gymSettings,
  recoveryLog,
  recoveryTypes,
  scheduledWorkouts,
  syncRuns,
  workoutExercises,
  workouts,
  workoutSubtypes,
  workoutTypes,
} from "../db/schema";
import { addDaysIso, todayIso, type IsoDate } from "../dates";
import { env } from "../env";
import { calendarConfigured, calendarName, listCalendars, workoutCalendar, client } from "./caldav";
import { buildEvent, uidFor } from "./ics";

const PUSH_WINDOW_DAYS = 60;
const SCAN_BACK_DAYS = 7;
const SCAN_FORWARD_DAYS = 14;
const MAX_ATTEMPTS_PER_RUN = 25;

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export type PushResult = { written: number; failed: number; errors: string[] };
export type ScanResult = { seen: number; created: number; calendars: string[] };

function topSetFor(workoutId: number): string | null {
  const rows = db
    .select({
      name: exercises.name,
      reps: exerciseSets.reps,
      weightLb: exerciseSets.weightLb,
    })
    .from(exerciseSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, exerciseSets.workoutExerciseId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(and(eq(workoutExercises.workoutId, workoutId), eq(exerciseSets.isWarmup, false)))
    .all();

  const best = rows.reduce<(typeof rows)[number] | null>((top, row) => {
    if (row.weightLb === null) return top;
    if (top === null || (top.weightLb ?? 0) < row.weightLb) return row;
    return top;
  }, null);

  if (!best?.weightLb) return null;
  return `${best.name} ${best.reps ?? "?"} x ${best.weightLb} lb`;
}

function eventFor(workoutId: number): { title: string; body: string } | null {
  const row = db
    .select({ workout: workouts, type: workoutTypes, subtype: workoutSubtypes })
    .from(workouts)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workouts.workoutTypeId))
    .leftJoin(workoutSubtypes, eq(workoutSubtypes.id, workouts.workoutSubtypeId))
    .where(eq(workouts.id, workoutId))
    .get();

  if (!row) return null;

  const recovery = db
    .select({ name: recoveryTypes.name })
    .from(recoveryLog)
    .innerJoin(recoveryTypes, eq(recoveryTypes.id, recoveryLog.recoveryTypeId))
    .where(eq(recoveryLog.workoutId, workoutId))
    .all()
    .map((r) => r.name);

  const title = row.subtype ? `${row.type.name} — ${row.subtype.name}` : row.type.name;

  return {
    title,
    body: buildEvent({
      uid: uidFor(workoutId),
      title,
      performedOn: row.workout.performedOn,
      startedAt: row.workout.startedAt,
      durationSec: row.workout.durationSec,
      rating: row.workout.rating,
      recovery,
      topSet: topSetFor(workoutId),
      sequence: Math.max(0, row.workout.updatedAt - row.workout.createdAt),
    }),
  };
}

/**
 * Pushes anything pending or previously failed. A failure records the reason on the
 * workout and leaves it pending, so the next run picks it up rather than the event
 * silently never appearing. Soft-deleted workouts that already reached the calendar
 * are deleted from it.
 */
export async function pushWorkouts(today: IsoDate = todayIso()): Promise<PushResult> {
  const result: PushResult = { written: 0, failed: 0, errors: [] };
  if (!calendarConfigured()) return result;

  const since = addDaysIso(today, -PUSH_WINDOW_DAYS);

  const pending = db
    .select()
    .from(workouts)
    .where(
      and(
        gte(workouts.performedOn, since),
        ne(workouts.calendarSyncState, "synced"),
        ne(workouts.calendarSyncState, "skipped"),
        isNull(workouts.deletedAt)
      )
    )
    .orderBy(asc(workouts.performedOn))
    .limit(MAX_ATTEMPTS_PER_RUN)
    .all();

  const removals = db
    .select()
    .from(workouts)
    .where(and(isNotNull(workouts.deletedAt), isNotNull(workouts.calendarHref)))
    .limit(MAX_ATTEMPTS_PER_RUN)
    .all();

  if (pending.length === 0 && removals.length === 0) return result;

  const calendar = await workoutCalendar();
  const dav = await client();

  for (const workout of pending) {
    const event = eventFor(workout.id);
    if (!event) continue;

    const filename = `${uidFor(workout.id)}.ics`;

    try {
      const response = workout.calendarHref
        ? await dav.updateCalendarObject({
            calendarObject: {
              url: workout.calendarHref,
              data: event.body,
              etag: workout.calendarEtag ?? undefined,
            },
          })
        : await dav.createCalendarObject({
            calendar,
            filename,
            iCalString: event.body,
          });

      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      db.update(workouts)
        .set({
          calendarUid: uidFor(workout.id),
          /**
           * Resolved the same way tsdav resolves it when creating the object, rather
           * than concatenated. A calendar URL without a trailing slash would
           * otherwise produce a href that no later update or delete can find.
           */
          calendarHref: workout.calendarHref ?? new URL(filename, calendar.url).href,
          calendarEtag: response.headers?.get?.("etag") ?? null,
          calendarSyncState: "synced",
          calendarSyncError: null,
          updatedAt: nowSec(),
        })
        .where(eq(workouts.id, workout.id))
        .run();

      result.written += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      db.update(workouts)
        .set({ calendarSyncState: "pending", calendarSyncError: message })
        .where(eq(workouts.id, workout.id))
        .run();
      result.failed += 1;
      if (!result.errors.includes(message)) result.errors.push(message);
    }
  }

  for (const workout of removals) {
    try {
      await dav.deleteCalendarObject({
        calendarObject: { url: workout.calendarHref!, etag: workout.calendarEtag ?? undefined },
      });
      db.update(workouts)
        .set({ calendarSyncState: "skipped", calendarHref: null, calendarEtag: null })
        .where(eq(workouts.id, workout.id))
        .run();
    } catch {
      // A delete that fails is retried next run; the row stays marked synced.
    }
  }

  return result;
}

const CLASS_HINTS: { pattern: RegExp; slug: string }[] = [
  { pattern: /olympius/i, slug: "ithinkfit-olympius" },
  { pattern: /gym\s*fit\s*camp|fit\s*camp/i, slug: "ithinkfit-gym-fit-camp" },
  { pattern: /west\s*o/i, slug: "west-o-strength" },
  { pattern: /\brun\b|running/i, slug: "running" },
  { pattern: /\bwalk\b|walking/i, slug: "walking" },
];

export function guessTypeFor(title: string): number | null {
  for (const hint of CLASS_HINTS) {
    if (!hint.pattern.test(title)) continue;
    const type = db
      .select({ id: workoutTypes.id })
      .from(workoutTypes)
      .where(and(eq(workoutTypes.slug, hint.slug), isNull(workoutTypes.archivedAt)))
      .get();
    if (type) return type.id;
  }
  return null;
}

export function scannedCalendarNames(): string[] {
  const row = db.select().from(gymSettings).get();
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.scannedCalendars);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

export function setScannedCalendars(names: string[]): void {
  const row = db.select().from(gymSettings).get();
  const value = JSON.stringify(names);

  if (row) {
    db.update(gymSettings)
      .set({ scannedCalendars: value, updatedAt: nowSec() })
      .where(eq(gymSettings.id, row.id))
      .run();
    return;
  }

  db.insert(gymSettings).values({ scannedCalendars: value }).run();
}

type ParsedEvent = { uid: string; title: string; startsAt: number; endsAt: number };

export function parseCalendarObjects(objects: { data?: string }[]): ParsedEvent[] {
  const out: ParsedEvent[] = [];

  for (const object of objects) {
    if (!object.data) continue;
    try {
      const comp = new ICAL.Component(ICAL.parse(object.data));
      for (const raw of comp.getAllSubcomponents("vevent")) {
        const event = new ICAL.Event(raw);
        if (!event.startDate) continue;

        const startsAt = Math.floor(event.startDate.toJSDate().getTime() / 1000);
        const endsAt = event.endDate
          ? Math.floor(event.endDate.toJSDate().getTime() / 1000)
          : startsAt + 3600;

        out.push({
          uid: event.uid ?? `${startsAt}`,
          title: (event.summary ?? "").trim() || "Untitled",
          startsAt,
          endsAt,
        });
      }
    } catch {
      // A single unparseable event should not sink the whole scan.
    }
  }

  return out;
}

/**
 * Classes Kyle books show up on his normal calendars. Scanning them turns a booked
 * class into a one-tap confirmation on the day rather than something to type in from
 * memory. Nothing is logged automatically — a booked class is not an attended one.
 */
export async function scanForClasses(today: IsoDate = todayIso()): Promise<ScanResult> {
  const result: ScanResult = { seen: 0, created: 0, calendars: [] };
  if (!calendarConfigured()) return result;

  const wanted = scannedCalendarNames().map((n) => n.trim().toLowerCase());
  if (wanted.length === 0) return result;

  const dav = await client();
  const calendars = (await listCalendars()).filter((c) =>
    wanted.includes(calendarName(c).trim().toLowerCase())
  );

  const from = new Date(`${addDaysIso(today, -SCAN_BACK_DAYS)}T00:00:00Z`);
  const to = new Date(`${addDaysIso(today, SCAN_FORWARD_DAYS)}T23:59:59Z`);

  for (const calendar of calendars) {
    const name = calendarName(calendar);
    result.calendars.push(name);

    const objects = await dav.fetchCalendarObjects({
      calendar,
      timeRange: { start: from.toISOString(), end: to.toISOString() },
    });

    for (const event of parseCalendarObjects(objects)) {
      result.seen += 1;

      const scheduledOn = formatInTimeZone(
        new Date(event.startsAt * 1000),
        env.DISPLAY_TIMEZONE,
        "yyyy-MM-dd"
      );

      const existing = db
        .select()
        .from(scheduledWorkouts)
        .where(
          and(
            eq(scheduledWorkouts.calendarName, name),
            eq(scheduledWorkouts.externalUid, event.uid),
            eq(scheduledWorkouts.startsAt, event.startsAt)
          )
        )
        .get();

      if (existing) {
        db.update(scheduledWorkouts)
          .set({ title: event.title, endsAt: event.endsAt, scheduledOn, lastSeenAt: nowSec() })
          .where(eq(scheduledWorkouts.id, existing.id))
          .run();
        continue;
      }

      db.insert(scheduledWorkouts)
        .values({
          calendarName: name,
          externalUid: event.uid,
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          scheduledOn,
          guessedTypeId: guessTypeFor(event.title),
        })
        .run();

      result.created += 1;
    }
  }

  return result;
}

export function pendingScheduled(today: IsoDate = todayIso()) {
  return db
    .select({ scheduled: scheduledWorkouts, type: workoutTypes })
    .from(scheduledWorkouts)
    .leftJoin(workoutTypes, eq(workoutTypes.id, scheduledWorkouts.guessedTypeId))
    .where(
      and(
        isNull(scheduledWorkouts.confirmedWorkoutId),
        isNull(scheduledWorkouts.dismissedAt),
        gte(scheduledWorkouts.scheduledOn, addDaysIso(today, -SCAN_BACK_DAYS)),
        lte(scheduledWorkouts.scheduledOn, today)
      )
    )
    .orderBy(asc(scheduledWorkouts.startsAt))
    .all();
}

export type SyncOutcome = {
  push: PushResult;
  scan: ScanResult;
  errors: string[];
};

export async function runCalendarSync(today: IsoDate = todayIso()): Promise<SyncOutcome> {
  const run = db
    .insert(syncRuns)
    .values({ source: "calendar", status: "running" })
    .returning({ id: syncRuns.id })
    .get();

  const outcome: SyncOutcome = {
    push: { written: 0, failed: 0, errors: [] },
    scan: { seen: 0, created: 0, calendars: [] },
    errors: [],
  };

  try {
    outcome.push = await pushWorkouts(today);
  } catch (error) {
    outcome.errors.push(error instanceof Error ? error.message : "push failed");
  }

  try {
    outcome.scan = await scanForClasses(today);
  } catch (error) {
    outcome.errors.push(error instanceof Error ? error.message : "scan failed");
  }

  const failed = outcome.errors.length > 0 || outcome.push.failed > 0;

  db.update(syncRuns)
    .set({
      finishedAt: nowSec(),
      status: failed ? "failed" : "ok",
      error: [...outcome.errors, ...outcome.push.errors].join("; ") || null,
      itemsWritten: outcome.push.written + outcome.scan.created,
    })
    .where(eq(syncRuns.id, run.id))
    .run();

  return outcome;
}

export function lastSyncRun() {
  return (
    db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.source, "calendar"))
      .orderBy(asc(syncRuns.startedAt))
      .all()
      .at(-1) ?? null
  );
}

export function markForResync(workoutId: number): void {
  db.update(workouts)
    .set({ calendarSyncState: "pending", calendarSyncError: null })
    .where(and(eq(workouts.id, workoutId), ne(workouts.calendarSyncState, "skipped")))
    .run();
}

export function resyncAll(): number {
  const rows = db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(isNull(workouts.deletedAt), ne(workouts.calendarSyncState, "skipped")))
    .all();

  if (rows.length === 0) return 0;

  db.update(workouts)
    .set({ calendarSyncState: "pending", calendarSyncError: null })
    .where(
      inArray(
        workouts.id,
        rows.map((r) => r.id)
      )
    )
    .run();

  return rows.length;
}

export function confirmScheduled(
  scheduledId: number,
  workoutId: number
): void {
  db.update(scheduledWorkouts)
    .set({ confirmedWorkoutId: workoutId })
    .where(eq(scheduledWorkouts.id, scheduledId))
    .run();
}

export function dismissScheduled(scheduledId: number): void {
  db.update(scheduledWorkouts)
    .set({ dismissedAt: nowSec() })
    .where(eq(scheduledWorkouts.id, scheduledId))
    .run();
}

export function pendingPushCount(): number {
  return (
    db
      .select({ total: count() })
      .from(workouts)
      .where(
        and(
          isNull(workouts.deletedAt),
          or(eq(workouts.calendarSyncState, "pending"), eq(workouts.calendarSyncState, "failed"))
        )
      )
      .get()?.total ?? 0
  );
}
