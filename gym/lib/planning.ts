import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "./db/client";
import {
  exercises,
  exerciseSets,
  planExercises,
  planSets,
  planTemplateDays,
  planTemplates,
  workoutExercises,
  workoutPlans,
  workouts,
  workoutSubtypes,
  workoutTypes,
} from "./db/schema";
import type {
  Exercise,
  MuscleGroup,
  PlanSource,
  PlanTemplate,
  PlanTemplateDay,
  WorkoutPlan,
  WorkoutSubtype,
  WorkoutType,
} from "./db/schema";
import { addDaysIso, dayOfWeekIso, isoRange, todayIso, type IsoDate } from "./dates";

export const DEFAULT_HORIZON_WEEKS = 8;
const DEFAULT_WORKING_SETS = 3;
const HISTORY_SESSIONS = 4;

export const PLAN_LIMITS = {
  exerciseCount: { min: 1, max: 20 },
  reps: { min: 1, max: 50 },
  restSeconds: { min: 0, max: 900 },
} as const;

export type PlanParams = {
  targetRepsLow: number;
  targetRepsHigh: number;
  restSeconds: number;
  exerciseCount: number;
};

export function planParamError(params: PlanParams): string | null {
  const { exerciseCount, reps, restSeconds } = PLAN_LIMITS;

  if (params.exerciseCount < exerciseCount.min || params.exerciseCount > exerciseCount.max) {
    return `exercises per day must be between ${exerciseCount.min} and ${exerciseCount.max}`;
  }
  if (
    params.targetRepsLow < reps.min ||
    params.targetRepsHigh < reps.min ||
    params.targetRepsLow > reps.max ||
    params.targetRepsHigh > reps.max
  ) {
    return `reps must be between ${reps.min} and ${reps.max}`;
  }
  if (params.targetRepsLow > params.targetRepsHigh) {
    return "the low rep target cannot exceed the high one";
  }
  if (params.restSeconds < restSeconds.min || params.restSeconds > restSeconds.max) {
    return `rest must be between ${restSeconds.min} and ${restSeconds.max} seconds`;
  }
  return null;
}

const SUBTYPE_MUSCLE_GROUPS: Record<string, MuscleGroup> = {
  back: "back",
  chest: "chest",
  legs: "legs",
  shoulders: "shoulders",
  "abs-and-calves": "abs_calves",
};

export type PlanRow = {
  plan: WorkoutPlan;
  type: WorkoutType;
  subtype: WorkoutSubtype | null;
  exerciseCountGenerated: number;
};

export type PlanDetail = {
  plan: WorkoutPlan;
  type: WorkoutType;
  subtype: WorkoutSubtype | null;
  exercises: {
    planExerciseId: number;
    exercise: Exercise;
    position: number;
    note: string | null;
    sets: { setNumber: number; targetReps: number | null; targetWeightLb: number | null; isWarmup: boolean }[];
  }[];
};

export function activeTemplate(): { template: PlanTemplate; days: PlanTemplateDay[] } | null {
  const template = db
    .select()
    .from(planTemplates)
    .where(eq(planTemplates.isActive, true))
    .orderBy(planTemplates.id)
    .get();
  if (!template) return null;

  const days = db
    .select()
    .from(planTemplateDays)
    .where(eq(planTemplateDays.templateId, template.id))
    .orderBy(planTemplateDays.dayOfWeek)
    .all();

  return { template, days };
}

export function muscleGroupsForPlan(
  type: WorkoutType,
  subtype: WorkoutSubtype | null
): MuscleGroup[] {
  if (subtype) {
    const mapped = SUBTYPE_MUSCLE_GROUPS[subtype.slug];
    if (mapped) return [mapped];
  }
  return ["back", "chest", "legs", "shoulders", "abs_calves", "other"];
}

export function libraryFor(groups: MuscleGroup[]): Exercise[] {
  return db
    .select()
    .from(exercises)
    .where(and(isNull(exercises.archivedAt), inArray(exercises.muscleGroup, groups)))
    .orderBy(exercises.name)
    .all();
}

/**
 * Creates plan rows for every templated day in the horizon that doesn't have one.
 * Existing plans are left alone unless they are still `scheduled` and unedited, in
 * which case their parameters are refreshed from the template.
 */
export function materializePlans(
  fromIso: IsoDate = todayIso(),
  weeks = DEFAULT_HORIZON_WEEKS
): { created: number; updated: number } {
  const active = activeTemplate();
  if (!active) return { created: 0, updated: 0 };

  const byDayOfWeek = new Map(active.days.map((day) => [day.dayOfWeek, day]));
  // isoRange is inclusive at both ends, so N weeks is N*7 days counting fromIso itself.
  const toIso = addDaysIso(fromIso, weeks * 7 - 1);

  const existing = db
    .select()
    .from(workoutPlans)
    .where(and(gte(workoutPlans.plannedOn, fromIso), lte(workoutPlans.plannedOn, toIso)))
    .all();
  const byDate = new Map(existing.map((plan) => [plan.plannedOn, plan]));

  let created = 0;
  let updated = 0;

  for (const iso of isoRange(fromIso, toIso)) {
    const templateDay = byDayOfWeek.get(dayOfWeekIso(iso));
    if (!templateDay || templateDay.workoutTypeId === null) continue;

    const current = byDate.get(iso);

    if (!current) {
      db.insert(workoutPlans)
        .values({
          plannedOn: iso,
          workoutTypeId: templateDay.workoutTypeId,
          workoutSubtypeId: templateDay.workoutSubtypeId,
          targetRepsLow: templateDay.targetRepsLow,
          targetRepsHigh: templateDay.targetRepsHigh,
          restSeconds: templateDay.restSeconds,
          exerciseCount: templateDay.exerciseCount,
          templateDayId: templateDay.id,
          status: "scheduled",
        })
        .run();
      created += 1;
      continue;
    }

    const untouched =
      current.status === "scheduled" && !current.isOverride && current.workoutId === null;
    if (!untouched) continue;

    const differs =
      current.workoutTypeId !== templateDay.workoutTypeId ||
      current.workoutSubtypeId !== templateDay.workoutSubtypeId ||
      current.targetRepsLow !== templateDay.targetRepsLow ||
      current.targetRepsHigh !== templateDay.targetRepsHigh ||
      current.restSeconds !== templateDay.restSeconds ||
      current.exerciseCount !== templateDay.exerciseCount;

    if (!differs) continue;

    db.update(workoutPlans)
      .set({
        workoutTypeId: templateDay.workoutTypeId,
        workoutSubtypeId: templateDay.workoutSubtypeId,
        targetRepsLow: templateDay.targetRepsLow,
        targetRepsHigh: templateDay.targetRepsHigh,
        restSeconds: templateDay.restSeconds,
        exerciseCount: templateDay.exerciseCount,
        templateDayId: templateDay.id,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(workoutPlans.id, current.id))
      .run();
    updated += 1;
  }

  return { created, updated };
}

export function plansInRange(fromIso: IsoDate, toIso: IsoDate): PlanRow[] {
  const rows = db
    .select({ plan: workoutPlans, type: workoutTypes, subtype: workoutSubtypes })
    .from(workoutPlans)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutPlans.workoutTypeId))
    .leftJoin(workoutSubtypes, eq(workoutSubtypes.id, workoutPlans.workoutSubtypeId))
    .where(and(gte(workoutPlans.plannedOn, fromIso), lte(workoutPlans.plannedOn, toIso)))
    .orderBy(workoutPlans.plannedOn)
    .all();

  const counts = new Map<number, number>();
  if (rows.length > 0) {
    const planIds = rows.map((r) => r.plan.id);
    for (const row of db
      .select({ planId: planExercises.planId })
      .from(planExercises)
      .where(inArray(planExercises.planId, planIds))
      .all()) {
      counts.set(row.planId, (counts.get(row.planId) ?? 0) + 1);
    }
  }

  return rows.map((row) => ({
    ...row,
    exerciseCountGenerated: counts.get(row.plan.id) ?? 0,
  }));
}

export function planDetail(id: number): PlanDetail | null {
  const row = db
    .select({ plan: workoutPlans, type: workoutTypes, subtype: workoutSubtypes })
    .from(workoutPlans)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workoutPlans.workoutTypeId))
    .leftJoin(workoutSubtypes, eq(workoutSubtypes.id, workoutPlans.workoutSubtypeId))
    .where(eq(workoutPlans.id, id))
    .get();
  if (!row) return null;

  const entries = db
    .select({ planExercise: planExercises, exercise: exercises })
    .from(planExercises)
    .innerJoin(exercises, eq(exercises.id, planExercises.exerciseId))
    .where(eq(planExercises.planId, id))
    .orderBy(planExercises.position)
    .all();

  const allSets =
    entries.length === 0
      ? []
      : db
          .select()
          .from(planSets)
          .where(
            inArray(
              planSets.planExerciseId,
              entries.map((e) => e.planExercise.id)
            )
          )
          .orderBy(planSets.setNumber)
          .all();

  return {
    ...row,
    exercises: entries.map((entry) => ({
      planExerciseId: entry.planExercise.id,
      exercise: entry.exercise,
      position: entry.planExercise.position,
      note: entry.planExercise.note,
      sets: allSets
        .filter((s) => s.planExerciseId === entry.planExercise.id)
        .map((s) => ({
          setNumber: s.setNumber,
          targetReps: s.targetReps,
          targetWeightLb: s.targetWeightLb,
          isWarmup: s.isWarmup,
        })),
    })),
  };
}

export type HistoryEntry = {
  performedOn: IsoDate;
  rating: number | null;
  exercises: { name: string; topSet: { reps: number | null; weightLb: number | null } | null }[];
};

export function recentHistoryFor(
  workoutTypeId: number,
  workoutSubtypeId: number | null,
  limit = HISTORY_SESSIONS
): HistoryEntry[] {
  const filters = [eq(workouts.workoutTypeId, workoutTypeId), isNull(workouts.deletedAt)];
  if (workoutSubtypeId !== null) filters.push(eq(workouts.workoutSubtypeId, workoutSubtypeId));

  const sessions = db
    .select({ id: workouts.id, performedOn: workouts.performedOn, rating: workouts.rating })
    .from(workouts)
    .where(and(...filters))
    .orderBy(desc(workouts.performedOn), desc(workouts.id))
    .limit(limit)
    .all();

  return sessions.map((session) => {
    const entries = db
      .select({ workoutExerciseId: workoutExercises.id, name: exercises.name })
      .from(workoutExercises)
      .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
      .where(eq(workoutExercises.workoutId, session.id))
      .orderBy(workoutExercises.position)
      .all();

    return {
      performedOn: session.performedOn,
      rating: session.rating,
      exercises: entries.map((entry) => {
        const sets = db
          .select()
          .from(exerciseSets)
          .where(
            and(
              eq(exerciseSets.workoutExerciseId, entry.workoutExerciseId),
              eq(exerciseSets.isWarmup, false)
            )
          )
          .all();
        const top = sets.reduce<(typeof sets)[number] | null>((best, set) => {
          if (set.weightLb === null) return best;
          if (best === null || (best.weightLb ?? 0) < set.weightLb) return set;
          return best;
        }, null);
        return {
          name: entry.name,
          topSet: top ? { reps: top.reps, weightLb: top.weightLb } : null,
        };
      }),
    };
  });
}

export function lastTopSetFor(exerciseId: number): { reps: number | null; weightLb: number | null } | null {
  const recent = db
    .select({ workoutExerciseId: workoutExercises.id })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workoutExercises.exerciseId, exerciseId), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.performedOn), desc(workouts.id))
    .limit(1)
    .get();
  if (!recent) return null;

  const sets = db
    .select()
    .from(exerciseSets)
    .where(
      and(
        eq(exerciseSets.workoutExerciseId, recent.workoutExerciseId),
        eq(exerciseSets.isWarmup, false)
      )
    )
    .all();

  const top = sets.reduce<(typeof sets)[number] | null>((best, set) => {
    if (set.weightLb === null) return best;
    if (best === null || (best.weightLb ?? 0) < set.weightLb) return set;
    return best;
  }, null);

  return top ? { reps: top.reps, weightLb: top.weightLb } : null;
}

export type GeneratedExercise = {
  exerciseId: number;
  note?: string | null;
  sets: { targetReps: number | null; targetWeightLb: number | null; isWarmup?: boolean }[];
};

export function writeGeneratedPlan(
  planId: number,
  generated: GeneratedExercise[],
  source: PlanSource
): void {
  db.delete(planExercises).where(eq(planExercises.planId, planId)).run();

  generated.forEach((entry, index) => {
    const planExercise = db
      .insert(planExercises)
      .values({
        planId,
        exerciseId: entry.exerciseId,
        position: index,
        note: entry.note ?? null,
      })
      .returning({ id: planExercises.id })
      .get();

    entry.sets.forEach((set, setIndex) => {
      db.insert(planSets)
        .values({
          planExerciseId: planExercise.id,
          setNumber: setIndex + 1,
          targetReps: set.targetReps,
          targetWeightLb: set.targetWeightLb,
          isWarmup: set.isWarmup ?? false,
        })
        .run();
    });
  });

  db.update(workoutPlans)
    .set({
      status: "generated",
      generatedBy: source,
      generatedAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(workoutPlans.id, planId))
    .run();
}

/**
 * Called after a workout is logged. A plan is a suggestion, so the match is
 * deliberately loose: same day, same workout type, not already claimed. Sub-day is
 * not required to match — training chest on the day legs were planned still closes
 * that plan out rather than leaving it hanging as unfinished.
 */
export function linkWorkoutToPlan(
  workoutId: number,
  performedOn: IsoDate,
  workoutTypeId: number
): number | null {
  const plan = db
    .select()
    .from(workoutPlans)
    .where(
      and(
        eq(workoutPlans.plannedOn, performedOn),
        eq(workoutPlans.workoutTypeId, workoutTypeId),
        isNull(workoutPlans.workoutId)
      )
    )
    .get();

  if (!plan) return null;

  db.update(workoutPlans)
    .set({ workoutId, status: "completed", updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(workoutPlans.id, plan.id))
    .run();
  db.update(workouts).set({ planId: plan.id }).where(eq(workouts.id, workoutId)).run();

  return plan.id;
}

/**
 * Deterministic generator. Runs when there's no API key, or when Claude fails or
 * returns something that doesn't validate. Picks least-recently-used exercises from
 * the muscle group so consecutive sessions vary, and prefills weights from history.
 */
export function generateFallback(
  plan: WorkoutPlan,
  type: WorkoutType,
  subtype: WorkoutSubtype | null
): GeneratedExercise[] {
  const library = libraryFor(muscleGroupsForPlan(type, subtype));
  if (library.length === 0) return [];

  const lastUsed = new Map<number, string>();
  for (const row of db
    .select({ exerciseId: workoutExercises.exerciseId, performedOn: workouts.performedOn })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(isNull(workouts.deletedAt))
    .all()) {
    const seen = lastUsed.get(row.exerciseId);
    if (!seen || seen < row.performedOn) lastUsed.set(row.exerciseId, row.performedOn);
  }

  const ordered = [...library].sort((a, b) => {
    const aSeen = lastUsed.get(a.id) ?? "";
    const bSeen = lastUsed.get(b.id) ?? "";
    if (aSeen !== bSeen) return aSeen < bSeen ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const midReps = Math.round((plan.targetRepsLow + plan.targetRepsHigh) / 2);

  return ordered.slice(0, plan.exerciseCount).map((exercise) => {
    const last = lastTopSetFor(exercise.id);
    return {
      exerciseId: exercise.id,
      note: null,
      sets: Array.from({ length: DEFAULT_WORKING_SETS }, () => ({
        targetReps: midReps,
        targetWeightLb: last?.weightLb ?? null,
        isWarmup: false,
      })),
    };
  });
}
