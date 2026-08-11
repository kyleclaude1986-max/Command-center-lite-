import { and, desc, eq, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "./db/client";
import {
  exercises,
  exerciseSets,
  goals,
  recoveryLog,
  recoveryTypes,
  workoutExercises,
  workouts,
  workoutSubtypes,
  workoutTypes,
} from "./db/schema";
import type { Goal, RecoveryType, WorkoutSubtype, WorkoutType } from "./db/schema";
import { APPLE_HEALTH_TYPE_SLUG } from "./seed-data";
import { todayIso, type IsoDate } from "./dates";

export type WorkoutTypeWithSubtypes = WorkoutType & {
  goal: Goal | null;
  subtypes: WorkoutSubtype[];
};

export type WorkoutRow = {
  id: number;
  performedOn: IsoDate;
  typeName: string;
  typeColor: string;
  subtypeName: string | null;
  goalName: string | null;
  goalMinDurationSec: number | null;
  durationSec: number | null;
  durationSource: string | null;
  caloriesKcal: number | null;
  rating: number | null;
  notes: string | null;
  calendarSyncState: string;
  provisional: boolean;
};

export type RecoveryRow = {
  id: number;
  recoveryTypeId: number;
  performedOn: IsoDate;
  name: string;
  color: string;
  workoutId: number | null;
};

export function getActiveWorkoutTypes(): WorkoutTypeWithSubtypes[] {
  const types = db
    .select()
    .from(workoutTypes)
    .where(isNull(workoutTypes.archivedAt))
    .orderBy(workoutTypes.position)
    .all();

  const subtypes = db
    .select()
    .from(workoutSubtypes)
    .where(isNull(workoutSubtypes.archivedAt))
    .orderBy(workoutSubtypes.position)
    .all();

  const allGoals = db.select().from(goals).all();
  const goalById = new Map(allGoals.map((g) => [g.id, g]));

  return types.map((type) => ({
    ...type,
    goal: type.goalId ? (goalById.get(type.goalId) ?? null) : null,
    subtypes: subtypes.filter((s) => s.workoutTypeId === type.id),
  }));
}

export function getLoggableWorkoutTypes(): WorkoutTypeWithSubtypes[] {
  return getActiveWorkoutTypes().filter((t) => t.slug !== APPLE_HEALTH_TYPE_SLUG);
}

export function getActiveRecoveryTypes(): RecoveryType[] {
  return db
    .select()
    .from(recoveryTypes)
    .where(isNull(recoveryTypes.archivedAt))
    .orderBy(recoveryTypes.position)
    .all();
}

function mapWorkoutRow(row: {
  workout: typeof workouts.$inferSelect;
  type: WorkoutType;
  subtype: WorkoutSubtype | null;
  goal: Goal | null;
}): WorkoutRow {
  const minDuration = row.goal?.minDurationSec ?? null;
  const provisional =
    minDuration !== null && (row.workout.durationSec === null || row.workout.durationSec < minDuration);

  return {
    id: row.workout.id,
    performedOn: row.workout.performedOn,
    typeName: row.type.name,
    typeColor: row.type.color,
    subtypeName: row.subtype?.name ?? null,
    goalName: row.goal?.name ?? null,
    goalMinDurationSec: minDuration,
    durationSec: row.workout.durationSec,
    durationSource: row.workout.durationSource,
    caloriesKcal: row.workout.caloriesKcal,
    rating: row.workout.rating,
    notes: row.workout.notes,
    calendarSyncState: row.workout.calendarSyncState,
    provisional,
  };
}

const workoutSelect = {
  workout: workouts,
  type: workoutTypes,
  subtype: workoutSubtypes,
  goal: goals,
};

function workoutQuery() {
  return db
    .select(workoutSelect)
    .from(workouts)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workouts.workoutTypeId))
    .leftJoin(workoutSubtypes, eq(workoutSubtypes.id, workouts.workoutSubtypeId))
    .leftJoin(goals, eq(goals.id, workoutTypes.goalId));
}

export function getWorkoutsOn(iso: IsoDate): WorkoutRow[] {
  return workoutQuery()
    .where(and(eq(workouts.performedOn, iso), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.createdAt))
    .all()
    .map(mapWorkoutRow);
}

export function getRecentWorkouts(limit = 30): WorkoutRow[] {
  return workoutQuery()
    .where(isNull(workouts.deletedAt))
    .orderBy(desc(workouts.performedOn), desc(workouts.createdAt))
    .limit(limit)
    .all()
    .map(mapWorkoutRow);
}

export function getWorkout(id: number): WorkoutRow | null {
  const row = workoutQuery()
    .where(and(eq(workouts.id, id), isNull(workouts.deletedAt)))
    .get();
  return row ? mapWorkoutRow(row) : null;
}

export function getUnratedWorkouts(today: IsoDate = todayIso(), limit = 3): WorkoutRow[] {
  return workoutQuery()
    .where(
      and(
        isNull(workouts.deletedAt),
        isNull(workouts.rating),
        lte(workouts.performedOn, today),
        ne(workoutTypes.slug, APPLE_HEALTH_TYPE_SLUG)
      )
    )
    .orderBy(desc(workouts.performedOn))
    .limit(limit)
    .all()
    .map(mapWorkoutRow);
}

export function getRecoveryOn(iso: IsoDate): RecoveryRow[] {
  return db
    .select({
      id: recoveryLog.id,
      recoveryTypeId: recoveryLog.recoveryTypeId,
      performedOn: recoveryLog.performedOn,
      name: recoveryTypes.name,
      color: recoveryTypes.color,
      workoutId: recoveryLog.workoutId,
    })
    .from(recoveryLog)
    .innerJoin(recoveryTypes, eq(recoveryTypes.id, recoveryLog.recoveryTypeId))
    .where(eq(recoveryLog.performedOn, iso))
    .orderBy(recoveryTypes.position)
    .all();
}

export type RatingAverage = {
  label: string;
  color: string;
  average: number;
  ratedCount: number;
  totalCount: number;
};

export function getRatingAveragesByType(): RatingAverage[] {
  const rows = db
    .select({
      label: workoutTypes.name,
      color: workoutTypes.color,
      total: sql<number>`count(*)`,
      rated: sql<number>`count(${workouts.rating})`,
      average: sql<number>`avg(${workouts.rating})`,
    })
    .from(workouts)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workouts.workoutTypeId))
    .where(isNull(workouts.deletedAt))
    .groupBy(workoutTypes.id)
    .all();

  return rows
    .filter((r) => r.rated > 0)
    .map((r) => ({
      label: r.label,
      color: r.color,
      average: r.average,
      ratedCount: r.rated,
      totalCount: r.total,
    }))
    .sort((a, b) => b.average - a.average);
}

export function getRatingAveragesBySubtype(): RatingAverage[] {
  const rows = db
    .select({
      label: workoutSubtypes.name,
      color: workoutTypes.color,
      total: sql<number>`count(*)`,
      rated: sql<number>`count(${workouts.rating})`,
      average: sql<number>`avg(${workouts.rating})`,
    })
    .from(workouts)
    .innerJoin(workoutSubtypes, eq(workoutSubtypes.id, workouts.workoutSubtypeId))
    .innerJoin(workoutTypes, eq(workoutTypes.id, workouts.workoutTypeId))
    .where(isNull(workouts.deletedAt))
    .groupBy(workoutSubtypes.id)
    .all();

  return rows
    .filter((r) => r.rated > 0)
    .map((r) => ({
      label: r.label,
      color: r.color,
      average: r.average,
      ratedCount: r.rated,
      totalCount: r.total,
    }))
    .sort((a, b) => b.average - a.average);
}

export type ExerciseHistorySet = { reps: number | null; weightLb: number | null };

export function getLastSetsForExercise(
  exerciseId: number,
  beforeWorkoutId?: number
): ExerciseHistorySet[] {
  const candidates = db
    .select({
      workoutExerciseId: workoutExercises.id,
      performedOn: workouts.performedOn,
      workoutId: workouts.id,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workoutExercises.exerciseId, exerciseId), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.performedOn), desc(workouts.id))
    .all();

  const previous = candidates.find((c) => c.workoutId !== beforeWorkoutId);
  if (!previous) return [];

  return db
    .select({ reps: exerciseSets.reps, weightLb: exerciseSets.weightLb })
    .from(exerciseSets)
    .where(eq(exerciseSets.workoutExerciseId, previous.workoutExerciseId))
    .orderBy(exerciseSets.setNumber)
    .all();
}

export function getActiveExercises() {
  return db
    .select()
    .from(exercises)
    .where(isNull(exercises.archivedAt))
    .orderBy(exercises.muscleGroup, exercises.name)
    .all();
}
