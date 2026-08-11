import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "./db/client";
import {
  goals as goalsTable,
  recoveryLog,
  recoveryTypes,
  vacations,
  workouts,
  workoutTypes,
} from "./db/schema";
import type { Goal } from "./db/schema";
import {
  addDaysIso,
  diffDaysIso,
  isoRange,
  todayIso,
  weekDaysIso,
  weekStartIso,
  type IsoDate,
} from "./dates";

const MAX_STREAK_WEEKS = 520;

export type GoalDay = {
  iso: IsoDate;
  qualified: boolean;
  vacation: boolean;
  future: boolean;
};

export type GoalWeek = {
  goal: Goal;
  weekStart: IsoDate;
  days: GoalDay[];
  qualifiedCount: number;
  vacationDays: number;
  target: number;
  adjustedTarget: number;
  met: boolean;
};

export type GoalSummary = GoalWeek & {
  streakWeeks: number;
};

export function vacationDaySet(fromIso: IsoDate, toIso: IsoDate): Set<IsoDate> {
  const rows = db
    .select()
    .from(vacations)
    .where(and(lte(vacations.startsOn, toIso), gte(vacations.endsOn, fromIso)))
    .all();

  const out = new Set<IsoDate>();
  for (const row of rows) {
    const start = row.startsOn < fromIso ? fromIso : row.startsOn;
    const end = row.endsOn > toIso ? toIso : row.endsOn;
    for (const iso of isoRange(start, end)) out.add(iso);
  }
  return out;
}

export function goalDaySet(goal: Goal, fromIso: IsoDate, toIso: IsoDate): Set<IsoDate> {
  const durationFilter =
    goal.minDurationSec === null ? undefined : gte(workouts.durationSec, goal.minDurationSec);

  const workoutDays = db
    .select({ day: workouts.performedOn })
    .from(workouts)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workouts.workoutTypeId))
    .where(
      and(
        eq(workoutTypes.goalId, goal.id),
        isNull(workouts.deletedAt),
        gte(workouts.performedOn, fromIso),
        lte(workouts.performedOn, toIso),
        durationFilter
      )
    )
    .all();

  const recoveryDays = db
    .select({ day: recoveryLog.performedOn })
    .from(recoveryLog)
    .innerJoin(recoveryTypes, eq(recoveryTypes.id, recoveryLog.recoveryTypeId))
    .where(
      and(
        eq(recoveryTypes.goalId, goal.id),
        gte(recoveryLog.performedOn, fromIso),
        lte(recoveryLog.performedOn, toIso)
      )
    )
    .all();

  const out = new Set<IsoDate>();
  for (const row of workoutDays) out.add(row.day);
  for (const row of recoveryDays) out.add(row.day);
  return out;
}

export function adjustedTarget(target: number, vacationDays: number): number {
  const homeDays = Math.max(0, 7 - vacationDays);
  return Math.max(0, Math.round((target * homeDays) / 7));
}

function buildWeek(
  goal: Goal,
  weekStart: IsoDate,
  qualified: Set<IsoDate>,
  vacationDays: Set<IsoDate>,
  today: IsoDate
): GoalWeek {
  const days = weekDaysIso(weekStart).map((iso) => ({
    iso,
    qualified: qualified.has(iso),
    vacation: vacationDays.has(iso),
    future: diffDaysIso(today, iso) > 0,
  }));

  const vacationCount = days.filter((d) => d.vacation).length;
  const qualifiedCount = days.filter((d) => d.qualified).length;
  const target = goal.targetDaysPerWeek;
  const adjusted = adjustedTarget(target, vacationCount);

  return {
    goal,
    weekStart,
    days,
    qualifiedCount,
    vacationDays: vacationCount,
    target,
    adjustedTarget: adjusted,
    met: qualifiedCount >= adjusted,
  };
}

export function goalSummary(goal: Goal, today: IsoDate = todayIso()): GoalSummary {
  const currentWeekStart = weekStartIso(today);
  const windowStart = addDaysIso(currentWeekStart, -7 * MAX_STREAK_WEEKS);
  const windowEnd = addDaysIso(currentWeekStart, 6);

  const qualified = goalDaySet(goal, windowStart, windowEnd);
  const vacationDays = vacationDaySet(windowStart, windowEnd);

  const current = buildWeek(goal, currentWeekStart, qualified, vacationDays, today);

  let streak = current.met ? 1 : 0;
  let cursor = addDaysIso(currentWeekStart, -7);

  const earliest = [...qualified].sort()[0];
  const floor = earliest ? weekStartIso(earliest) : currentWeekStart;

  while (cursor >= floor) {
    const week = buildWeek(goal, cursor, qualified, vacationDays, today);
    if (!week.met) break;
    streak += 1;
    cursor = addDaysIso(cursor, -7);
  }

  return { ...current, streakWeeks: streak };
}

export function activeGoals(): Goal[] {
  return db
    .select()
    .from(goalsTable)
    .where(isNull(goalsTable.archivedAt))
    .orderBy(goalsTable.position)
    .all();
}

export function goalSummaries(today: IsoDate = todayIso()): GoalSummary[] {
  return activeGoals().map((goal) => goalSummary(goal, today));
}
