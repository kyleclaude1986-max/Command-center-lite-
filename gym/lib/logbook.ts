import { and, asc, desc, eq, gt, inArray, isNull, lt, max, sql } from "drizzle-orm";
import { db } from "./db/client";
import {
  exercises,
  exerciseSets,
  planExercises,
  planSets,
  workoutExercises,
  workouts,
} from "./db/schema";
import type { Exercise, ExerciseSet, MuscleGroup } from "./db/schema";

export type LoggedSet = {
  id: number;
  setNumber: number;
  reps: number | null;
  weightLb: number | null;
  isWarmup: boolean;
  rpe: number | null;
};

export type LoggedExercise = {
  id: number;
  exercise: Exercise;
  position: number;
  note: string | null;
  sets: LoggedSet[];
  lastTime: { performedOn: string; sets: LoggedSet[] } | null;
};

const DEFAULT_SETS = 3;

function setsFor(workoutExerciseId: number): LoggedSet[] {
  return db
    .select()
    .from(exerciseSets)
    .where(eq(exerciseSets.workoutExerciseId, workoutExerciseId))
    .orderBy(asc(exerciseSets.setNumber), asc(exerciseSets.id))
    .all()
    .map(toLoggedSet);
}

function toLoggedSet(row: ExerciseSet): LoggedSet {
  return {
    id: row.id,
    setNumber: row.setNumber,
    reps: row.reps,
    weightLb: row.weightLb,
    isWarmup: row.isWarmup,
    rpe: row.rpe,
  };
}

/**
 * The last time this exercise was trained before the given session. This is the
 * number that actually drives the next set — nobody remembers what they benched
 * three weeks ago, and having to open the history screen to find out is the
 * difference between logging and not bothering.
 *
 * Strictly before, not merely "a different session": opening a workout from March
 * should not be told what was lifted in April. Same-day sessions fall back to id
 * order, which is creation order.
 */
export function lastTimeFor(
  exerciseId: number,
  beforeWorkoutId: number
): { performedOn: string; sets: LoggedSet[] } | null {
  const current = db
    .select({ performedOn: workouts.performedOn })
    .from(workouts)
    .where(eq(workouts.id, beforeWorkoutId))
    .get();
  if (!current) return null;

  const previous = db
    .select({
      workoutExerciseId: workoutExercises.id,
      performedOn: workouts.performedOn,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        isNull(workouts.deletedAt),
        sql`(${workouts.performedOn} < ${current.performedOn}
             or (${workouts.performedOn} = ${current.performedOn}
                 and ${workouts.id} < ${beforeWorkoutId}))`
      )
    )
    .orderBy(desc(workouts.performedOn), desc(workouts.id))
    .limit(1)
    .get();

  if (!previous) return null;

  const sets = setsFor(previous.workoutExerciseId);
  if (sets.length === 0) return null;

  return { performedOn: previous.performedOn, sets };
}

export function workoutLog(workoutId: number): LoggedExercise[] {
  const rows = db
    .select({ entry: workoutExercises, exercise: exercises })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position), asc(workoutExercises.id))
    .all();

  return rows.map(({ entry, exercise }) => ({
    id: entry.id,
    exercise,
    position: entry.position,
    note: entry.notes,
    sets: setsFor(entry.id),
    lastTime: lastTimeFor(exercise.id, workoutId),
  }));
}

function nextPosition(workoutId: number): number {
  const row = db
    .select({ highest: max(workoutExercises.position) })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .get();
  return (row?.highest ?? -1) + 1;
}

/**
 * A new exercise arrives with sets already laid out — blank rows to type into rather
 * than a button to press three times. Reps and weight come from last time when there
 * is a last time, because the common case is repeating it or adding five pounds.
 */
export function addExercise(workoutId: number, exerciseId: number): number {
  const existing = db
    .select()
    .from(workoutExercises)
    .where(
      and(eq(workoutExercises.workoutId, workoutId), eq(workoutExercises.exerciseId, exerciseId))
    )
    .get();
  if (existing) return existing.id;

  const created = db
    .insert(workoutExercises)
    .values({ workoutId, exerciseId, position: nextPosition(workoutId) })
    .returning({ id: workoutExercises.id })
    .get();

  const last = lastTimeFor(exerciseId, workoutId);
  const working = last?.sets.filter((set) => !set.isWarmup) ?? [];
  const count = working.length > 0 ? working.length : DEFAULT_SETS;

  for (let i = 0; i < count; i += 1) {
    const reference = working[i] ?? working[working.length - 1] ?? null;
    db.insert(exerciseSets)
      .values({
        workoutExerciseId: created.id,
        setNumber: i + 1,
        reps: reference?.reps ?? null,
        weightLb: reference?.weightLb ?? null,
        isWarmup: false,
      })
      .run();
  }

  return created.id;
}

export function removeExercise(workoutExerciseId: number): void {
  const entry = db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.id, workoutExerciseId))
    .get();
  if (!entry) return;

  db.delete(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId)).run();
  db.update(workoutExercises)
    .set({ position: sql`${workoutExercises.position} - 1` })
    .where(
      and(
        eq(workoutExercises.workoutId, entry.workoutId),
        gt(workoutExercises.position, entry.position)
      )
    )
    .run();
}

export function moveExercise(workoutExerciseId: number, direction: "up" | "down"): boolean {
  const entry = db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.id, workoutExerciseId))
    .get();
  if (!entry) return false;

  const neighbour = db
    .select()
    .from(workoutExercises)
    .where(
      and(
        eq(workoutExercises.workoutId, entry.workoutId),
        direction === "up"
          ? lt(workoutExercises.position, entry.position)
          : gt(workoutExercises.position, entry.position)
      )
    )
    .orderBy(
      direction === "up" ? desc(workoutExercises.position) : asc(workoutExercises.position)
    )
    .limit(1)
    .get();

  if (!neighbour) return false;

  db.update(workoutExercises)
    .set({ position: neighbour.position })
    .where(eq(workoutExercises.id, entry.id))
    .run();
  db.update(workoutExercises)
    .set({ position: entry.position })
    .where(eq(workoutExercises.id, neighbour.id))
    .run();

  return true;
}

export function addSet(workoutExerciseId: number, isWarmup = false): number {
  const existing = setsFor(workoutExerciseId);
  const reference = [...existing].reverse().find((set) => set.isWarmup === isWarmup) ?? null;

  return db
    .insert(exerciseSets)
    .values({
      workoutExerciseId,
      setNumber: (existing[existing.length - 1]?.setNumber ?? 0) + 1,
      reps: reference?.reps ?? null,
      weightLb: reference?.weightLb ?? null,
      isWarmup,
    })
    .returning({ id: exerciseSets.id })
    .get().id;
}

export type SetPatch = {
  reps?: number | null;
  weightLb?: number | null;
  isWarmup?: boolean;
  rpe?: number | null;
};

export function updateSet(setId: number, patch: SetPatch): boolean {
  const existing = db.select().from(exerciseSets).where(eq(exerciseSets.id, setId)).get();
  if (!existing) return false;
  db.update(exerciseSets).set(patch).where(eq(exerciseSets.id, setId)).run();
  return true;
}

export function removeSet(setId: number): void {
  db.delete(exerciseSets).where(eq(exerciseSets.id, setId)).run();
}

/**
 * Copies a plan's exercises and target sets into a workout so the session starts
 * filled in rather than empty. Only runs on an empty log — a plan is a starting
 * point, and overwriting work already logged would be the wrong kind of helpful.
 */
export function prefillFromPlan(workoutId: number, planId: number): number {
  const alreadyLogged = db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .all();
  if (alreadyLogged.length > 0) return 0;

  const planned = db
    .select()
    .from(planExercises)
    .where(eq(planExercises.planId, planId))
    .orderBy(asc(planExercises.position), asc(planExercises.id))
    .all();
  if (planned.length === 0) return 0;

  const targets = db
    .select()
    .from(planSets)
    .where(
      inArray(
        planSets.planExerciseId,
        planned.map((entry) => entry.id)
      )
    )
    .orderBy(asc(planSets.setNumber), asc(planSets.id))
    .all();

  planned.forEach((entry, index) => {
    const created = db
      .insert(workoutExercises)
      .values({
        workoutId,
        exerciseId: entry.exerciseId,
        position: index,
        notes: entry.note,
      })
      .returning({ id: workoutExercises.id })
      .get();

    const mine = targets.filter((set) => set.planExerciseId === entry.id);
    const rows = mine.length > 0 ? mine : [{ setNumber: 1, targetReps: null, targetWeightLb: null, isWarmup: false }];

    rows.forEach((set, setIndex) => {
      db.insert(exerciseSets)
        .values({
          workoutExerciseId: created.id,
          setNumber: setIndex + 1,
          reps: set.targetReps,
          weightLb: set.targetWeightLb,
          isWarmup: set.isWarmup,
        })
        .run();
    });
  });

  return planned.length;
}

export type ExerciseOption = { id: number; name: string; muscleGroup: MuscleGroup };

export function exerciseOptions(): ExerciseOption[] {
  return db
    .select({ id: exercises.id, name: exercises.name, muscleGroup: exercises.muscleGroup })
    .from(exercises)
    .where(isNull(exercises.archivedAt))
    .orderBy(asc(exercises.muscleGroup), asc(exercises.name))
    .all();
}

export type WorkoutVolume = { sets: number; reps: number; volumeLb: number };

export function workoutVolume(workoutId: number): WorkoutVolume {
  const rows = db
    .select({ reps: exerciseSets.reps, weightLb: exerciseSets.weightLb })
    .from(exerciseSets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, exerciseSets.workoutExerciseId))
    .where(and(eq(workoutExercises.workoutId, workoutId), eq(exerciseSets.isWarmup, false)))
    .all();

  return rows.reduce<WorkoutVolume>(
    (total, row) => ({
      sets: total.sets + 1,
      reps: total.reps + (row.reps ?? 0),
      volumeLb: total.volumeLb + (row.reps ?? 0) * (row.weightLb ?? 0),
    }),
    { sets: 0, reps: 0, volumeLb: 0 }
  );
}
