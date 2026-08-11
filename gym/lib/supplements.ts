import { and, gte, isNull, lte } from "drizzle-orm";
import { db } from "./db/client";
import { supplementLog, supplements, supplementSlots, workouts } from "./db/schema";
import type { Supplement, SupplementSlot } from "./db/schema";
import {
  addDaysIso,
  dayOfWeekIso,
  diffDaysIso,
  isoRange,
  todayIso,
  type IsoDate,
} from "./dates";

const MAX_STREAK_DAYS = 730;

export type DayStatus = "hit" | "missed" | "not_logged" | "nothing_due" | "in_progress";

export type SupplementDay = {
  iso: IsoDate;
  due: Supplement[];
  takenIds: Set<number>;
  status: DayStatus;
};

export type SlotGroup = {
  slot: SupplementSlot;
  items: { supplement: Supplement; taken: boolean }[];
};

export function activeSlots(): SupplementSlot[] {
  return db
    .select()
    .from(supplementSlots)
    .where(isNull(supplementSlots.archivedAt))
    .orderBy(supplementSlots.position)
    .all();
}

export function activeSupplements(): Supplement[] {
  return db
    .select()
    .from(supplements)
    .where(isNull(supplements.archivedAt))
    .orderBy(supplements.position)
    .all();
}

function workoutDaySet(fromIso: IsoDate, toIso: IsoDate): Set<IsoDate> {
  const rows = db
    .select({ day: workouts.performedOn })
    .from(workouts)
    .where(
      and(
        isNull(workouts.deletedAt),
        gte(workouts.performedOn, fromIso),
        lte(workouts.performedOn, toIso)
      )
    )
    .all();
  return new Set(rows.map((r) => r.day));
}

export function isDueOn(
  supplement: Supplement,
  iso: IsoDate,
  workoutDays: Set<IsoDate>
): boolean {
  if (supplement.archivedAt !== null) return false;
  if (supplement.startsOn && iso < supplement.startsOn) return false;

  switch (supplement.scheduleKind) {
    case "daily":
      return true;
    case "weekdays": {
      const days = parseDays(supplement.scheduleDays);
      return days.includes(dayOfWeekIso(iso));
    }
    case "workout_days":
      return workoutDays.has(iso);
    case "interval": {
      const every = supplement.intervalDays ?? 0;
      if (every <= 0 || !supplement.startsOn) return false;
      return diffDaysIso(supplement.startsOn, iso) % every === 0;
    }
    default:
      return false;
  }
}

export function parseDays(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is number => typeof d === "number" && d >= 1 && d <= 7);
  } catch {
    return [];
  }
}

function takenByDay(fromIso: IsoDate, toIso: IsoDate): Map<IsoDate, Set<number>> {
  const rows = db
    .select()
    .from(supplementLog)
    .where(and(gte(supplementLog.takenOn, fromIso), lte(supplementLog.takenOn, toIso)))
    .all();

  const out = new Map<IsoDate, Set<number>>();
  for (const row of rows) {
    const set = out.get(row.takenOn) ?? new Set<number>();
    set.add(row.supplementId);
    out.set(row.takenOn, set);
  }
  return out;
}

function statusFor(due: Supplement[], taken: Set<number>, isToday: boolean): DayStatus {
  if (due.length === 0) return "nothing_due";
  const hitCount = due.filter((s) => taken.has(s.id)).length;
  if (hitCount === due.length) return "hit";
  if (isToday) return "in_progress";
  if (taken.size === 0) return "not_logged";
  return "missed";
}

export function supplementDay(iso: IsoDate, today: IsoDate = todayIso()): SupplementDay {
  const all = activeSupplements();
  const workoutDays = workoutDaySet(iso, iso);
  const due = all.filter((s) => isDueOn(s, iso, workoutDays));
  const taken = takenByDay(iso, iso).get(iso) ?? new Set<number>();
  return { iso, due, takenIds: taken, status: statusFor(due, taken, iso === today) };
}

export function slotGroupsFor(iso: IsoDate): SlotGroup[] {
  const day = supplementDay(iso);

  return activeSlots()
    .map((slot) => ({
      slot,
      items: day.due
        .filter((s) => s.slotId === slot.id)
        .map((supplement) => ({ supplement, taken: day.takenIds.has(supplement.id) })),
    }))
    .filter((group) => group.items.length > 0);
}

export function supplementStreak(today: IsoDate = todayIso()): number {
  const all = activeSupplements();
  if (all.length === 0) return 0;

  const windowStart = addDaysIso(today, -MAX_STREAK_DAYS);
  const workoutDays = workoutDaySet(windowStart, today);
  const taken = takenByDay(windowStart, today);

  const earliest = [...taken.keys()].sort()[0];
  if (!earliest) return 0;

  let streak = 0;
  let cursor = addDaysIso(today, -1);

  while (cursor >= earliest) {
    const due = all.filter((s) => isDueOn(s, cursor, workoutDays));
    const takenOnDay = taken.get(cursor) ?? new Set<number>();
    const status = statusFor(due, takenOnDay, false);
    if (status === "hit" || status === "nothing_due") {
      if (status === "hit") streak += 1;
      cursor = addDaysIso(cursor, -1);
      continue;
    }
    break;
  }

  const todayDue = all.filter((s) => isDueOn(s, today, workoutDays));
  const todayTaken = taken.get(today) ?? new Set<number>();
  if (statusFor(todayDue, todayTaken, false) === "hit") streak += 1;

  return streak;
}

export function supplementMonth(anyDayInMonth: IsoDate, today: IsoDate = todayIso()) {
  const first = `${anyDayInMonth.slice(0, 7)}-01`;
  const lastDay = new Date(
    Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0, 12)
  );
  const last = lastDay.toISOString().slice(0, 10);

  const all = activeSupplements();
  const workoutDays = workoutDaySet(first, last);
  const taken = takenByDay(first, last);

  return isoRange(first, last).map((iso) => {
    if (iso > today) return { iso, status: "nothing_due" as DayStatus, future: true };
    const due = all.filter((s) => isDueOn(s, iso, workoutDays));
    const takenOnDay = taken.get(iso) ?? new Set<number>();
    return { iso, status: statusFor(due, takenOnDay, iso === today), future: false };
  });
}
