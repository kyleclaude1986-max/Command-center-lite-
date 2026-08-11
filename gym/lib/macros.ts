import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "./db/client";
import { macroTargets, workoutTypes, workouts } from "./db/schema";
import type { MacroDirection, MacroTarget } from "./db/schema";
import { addDaysIso, todayIso, type IsoDate } from "./dates";
import { totalsOn, hasFoodOn, type Macros } from "./food/diary";

export const REST_DAY_SCOPE = 0;

export const MACRO_KEYS = ["calories", "proteinG", "carbsG", "fatG"] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

export const MACRO_LABELS: Record<MacroKey, string> = {
  calories: "Calories",
  proteinG: "Protein",
  carbsG: "Carbs",
  fatG: "Fat",
};

export const MACRO_UNITS: Record<MacroKey, string> = {
  calories: "",
  proteinG: "g",
  carbsG: "g",
  fatG: "g",
};

const DIRECTION_FIELD: Record<MacroKey, keyof MacroTarget> = {
  calories: "caloriesDirection",
  proteinG: "proteinDirection",
  carbsG: "carbsDirection",
  fatG: "fatDirection",
};

const TARGET_FIELD: Record<MacroKey, keyof MacroTarget> = {
  calories: "calories",
  proteinG: "proteinG",
  carbsG: "carbsG",
  fatG: "fatG",
};

export function defaultTarget(): MacroTarget {
  const row = db
    .select()
    .from(macroTargets)
    .where(eq(macroTargets.scopeKey, REST_DAY_SCOPE))
    .get();
  if (!row) throw new Error("the rest-day macro target is missing");
  return row;
}

/**
 * Targets are per workout type, because a leg day and a rest day are not the same
 * eating day. The type of the first qualifying workout logged that day picks the
 * target; a day with no workout falls back to the rest-day default. Deciding by what
 * was actually done, rather than what was planned, means a skipped session does not
 * leave a bulking target in place.
 */
export function targetFor(iso: IsoDate): { target: MacroTarget; scopeName: string } {
  const logged = db
    .select({ typeId: workoutTypes.id, name: workoutTypes.name })
    .from(workouts)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workouts.workoutTypeId))
    .where(and(eq(workouts.performedOn, iso), isNull(workouts.deletedAt)))
    .orderBy(asc(workouts.id))
    .all();

  for (const workout of logged) {
    const scoped = db
      .select()
      .from(macroTargets)
      .where(eq(macroTargets.scopeKey, workout.typeId))
      .get();
    if (scoped) return { target: scoped, scopeName: workout.name };
  }

  return { target: defaultTarget(), scopeName: "Rest day" };
}

export type MacroVerdict = "hit" | "over" | "under" | "pending";

export type MacroLine = {
  key: MacroKey;
  label: string;
  unit: string;
  eaten: number;
  target: number;
  direction: MacroDirection;
  verdict: MacroVerdict;
  progressPct: number;
};

/**
 * Protein is a floor, calories and carbs and fat are ceilings, and every direction is
 * switchable per macro in admin. A tolerance band keeps the verdict honest — landing
 * four grams under a 180 g protein target is not a miss in any sense that matters.
 *
 * "pending" is for today, where a ceiling has not been broken and a floor has not yet
 * been reached. An unmet protein floor at 2pm is not a failure, it is lunch.
 */
export function verdictFor(
  eaten: number,
  target: number,
  direction: MacroDirection,
  tolerancePct: number,
  isToday: boolean
): MacroVerdict {
  const slack = (target * tolerancePct) / 100;

  if (direction === "at_least") {
    if (eaten >= target - slack) return "hit";
    return isToday ? "pending" : "under";
  }

  if (direction === "at_most") {
    if (eaten > target + slack) return "over";
    if (isToday) return eaten === 0 ? "pending" : "hit";
    return "hit";
  }

  if (eaten > target + slack) return "over";
  if (eaten >= target - slack) return "hit";
  return isToday ? "pending" : "under";
}

export type MacroDay = {
  iso: IsoDate;
  scopeName: string;
  lines: MacroLine[];
  totals: Macros;
  tolerancePct: number;
  logged: boolean;
  allHit: boolean;
};

export function macroDay(iso: IsoDate, today: IsoDate = todayIso()): MacroDay {
  const { target, scopeName } = targetFor(iso);
  const totals = totalsOn(iso);
  const logged = hasFoodOn(iso);
  const isToday = iso === today;

  const lines: MacroLine[] = MACRO_KEYS.map((key) => {
    const goal = target[TARGET_FIELD[key]] as number;
    const direction = target[DIRECTION_FIELD[key]] as MacroDirection;
    const eaten = totals[key];

    return {
      key,
      label: MACRO_LABELS[key],
      unit: MACRO_UNITS[key],
      eaten,
      target: goal,
      direction,
      verdict: logged
        ? verdictFor(eaten, goal, direction, target.tolerancePct, isToday)
        : isToday
          ? "pending"
          : "under",
      progressPct: goal <= 0 ? 0 : Math.min(100, Math.round((eaten / goal) * 100)),
    };
  });

  return {
    iso,
    scopeName,
    lines,
    totals,
    tolerancePct: target.tolerancePct,
    logged,
    allHit: logged && lines.every((line) => line.verdict === "hit"),
  };
}

export type NutritionDayStatus = "hit" | "missed" | "not_logged" | "in_progress";

export function nutritionStatus(iso: IsoDate, today: IsoDate = todayIso()): NutritionDayStatus {
  const day = macroDay(iso, today);
  if (!day.logged) return iso === today ? "in_progress" : "not_logged";
  if (day.allHit) return "hit";
  if (iso === today && day.lines.every((line) => line.verdict !== "over")) return "in_progress";
  return "missed";
}

/**
 * A day counts when all four macros land. Today stays in progress until it closes —
 * the same principle as the supplement streak and the in-progress week — and a day
 * with nothing logged reads not logged rather than missed, so an untracked day and a
 * bad day are not the same thing on the calendar.
 */
export function nutritionStreak(today: IsoDate = todayIso(), lookback = 400): number {
  let streak = 0;

  for (let offset = 0; offset < lookback; offset += 1) {
    const iso = addDaysIso(today, -offset);
    const status = nutritionStatus(iso, today);

    if (status === "hit") {
      streak += 1;
      continue;
    }
    if (offset === 0 && status === "in_progress") continue;
    break;
  }

  return streak;
}

export function macroMonth(anchor: IsoDate, today: IsoDate = todayIso()) {
  const first = `${anchor.slice(0, 7)}-01`;
  const days: { iso: IsoDate; status: NutritionDayStatus }[] = [];

  for (let offset = 0; ; offset += 1) {
    const iso = addDaysIso(first, offset);
    if (iso.slice(0, 7) !== anchor.slice(0, 7)) break;
    days.push({ iso, status: iso > today ? "not_logged" : nutritionStatus(iso, today) });
  }

  return days;
}

export type MacroHitRate = { key: MacroKey; label: string; hits: number; days: number };

export function hitRates(from: IsoDate, to: IsoDate, today: IsoDate = todayIso()): MacroHitRate[] {
  const counts = new Map<MacroKey, { hits: number; days: number }>(
    MACRO_KEYS.map((key) => [key, { hits: 0, days: 0 }])
  );

  for (let iso = from; iso <= to; iso = addDaysIso(iso, 1)) {
    const day = macroDay(iso, today);
    if (!day.logged) continue;
    for (const line of day.lines) {
      const bucket = counts.get(line.key)!;
      bucket.days += 1;
      if (line.verdict === "hit") bucket.hits += 1;
    }
  }

  return MACRO_KEYS.map((key) => ({
    key,
    label: MACRO_LABELS[key],
    ...counts.get(key)!,
  }));
}
