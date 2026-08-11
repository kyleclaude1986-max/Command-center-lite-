import { asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "./db/client";
import {
  bodyMetrics,
  dailyEnergy,
  exercises,
  exerciseSets,
  foodLogEntries,
  foods,
  goals,
  macroTargets,
  progressPhotos,
  recoveryLog,
  recoveryTypes,
  supplementLog,
  supplements,
  supplementSlots,
  vacations,
  workoutExercises,
  workouts,
  workoutSubtypes,
  workoutTypes,
} from "./db/schema";

/**
 * Photos are referenced but never inlined. A JSON export with a year of base64
 * images in it is a file nothing will open, and the photos are already covered by
 * the nightly backup of the photo directory.
 */
export function fullExport() {
  return {
    exportedAt: new Date().toISOString(),
    goals: db.select().from(goals).all(),
    workoutTypes: db.select().from(workoutTypes).all(),
    workoutSubtypes: db.select().from(workoutSubtypes).all(),
    recoveryTypes: db.select().from(recoveryTypes).all(),
    exercises: db.select().from(exercises).all(),
    vacations: db.select().from(vacations).all(),
    macroTargets: db.select().from(macroTargets).all(),
    supplementSlots: db.select().from(supplementSlots).all(),
    supplements: db.select().from(supplements).all(),
    supplementLog: db.select().from(supplementLog).all(),
    workouts: db.select().from(workouts).all(),
    workoutExercises: db.select().from(workoutExercises).all(),
    exerciseSets: db.select().from(exerciseSets).all(),
    recoveryLog: db.select().from(recoveryLog).all(),
    bodyMetrics: db.select().from(bodyMetrics).all(),
    dailyEnergy: db.select().from(dailyEnergy).all(),
    foods: db.select().from(foods).all(),
    foodLogEntries: db.select().from(foodLogEntries).all(),
    progressPhotos: db
      .select({
        id: progressPhotos.id,
        takenOn: progressPhotos.takenOn,
        pose: progressPhotos.pose,
        storageKey: progressPhotos.storageKey,
        mimeType: progressPhotos.mimeType,
        byteSize: progressPhotos.byteSize,
      })
      .from(progressPhotos)
      .all(),
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const keys = columns ?? Object.keys(rows[0]!);
  const lines = [keys.join(",")];
  for (const row of rows) lines.push(keys.map((key) => csvCell(row[key])).join(","));
  return `${lines.join("\n")}\n`;
}

export const CSV_TABLES = ["workouts", "sets", "body", "food", "supplements"] as const;
export type CsvTable = (typeof CSV_TABLES)[number];

export function isCsvTable(value: unknown): value is CsvTable {
  return typeof value === "string" && (CSV_TABLES as readonly string[]).includes(value);
}

/**
 * A CSV is for reading in a spreadsheet, so ids are replaced by names and rows are
 * flattened. The JSON export is the one that round-trips.
 */
export function csvFor(table: CsvTable): string {
  switch (table) {
    case "workouts": {
      const rows = db
        .select({
          date: workouts.performedOn,
          type: workoutTypes.name,
          day: workoutSubtypes.name,
          minutes: workouts.durationSec,
          source: workouts.durationSource,
          rating: workouts.rating,
          calories: workouts.caloriesKcal,
          notes: workouts.notes,
        })
        .from(workouts)
        .innerJoin(workoutTypes, eq(workoutTypes.id, workouts.workoutTypeId))
        .leftJoin(workoutSubtypes, eq(workoutSubtypes.id, workouts.workoutSubtypeId))
        .where(isNull(workouts.deletedAt))
        .orderBy(desc(workouts.performedOn), asc(workouts.id))
        .all();

      return toCsv(
        rows.map((row) => ({
          ...row,
          minutes: row.minutes === null ? null : Math.round(row.minutes / 60),
        }))
      );
    }

    case "sets": {
      const rows = db
        .select({
          date: workouts.performedOn,
          type: workoutTypes.name,
          day: workoutSubtypes.name,
          exercise: exercises.name,
          position: workoutExercises.position,
          set: exerciseSets.setNumber,
          warmup: exerciseSets.isWarmup,
          reps: exerciseSets.reps,
          weight_lb: exerciseSets.weightLb,
          rpe: exerciseSets.rpe,
        })
        .from(exerciseSets)
        .innerJoin(workoutExercises, eq(workoutExercises.id, exerciseSets.workoutExerciseId))
        .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
        .innerJoin(workoutTypes, eq(workoutTypes.id, workouts.workoutTypeId))
        .leftJoin(workoutSubtypes, eq(workoutSubtypes.id, workouts.workoutSubtypeId))
        .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
        .where(isNull(workouts.deletedAt))
        .orderBy(desc(workouts.performedOn), asc(workoutExercises.position), asc(exerciseSets.setNumber))
        .all();

      return toCsv(rows.map((row) => ({ ...row, warmup: row.warmup ? "yes" : "no" })));
    }

    case "body": {
      const rows = db
        .select({
          date: bodyMetrics.measuredOn,
          weight_lb: bodyMetrics.weightLb,
          muscle_lb: bodyMetrics.muscleMassLb,
          fat_lb: bodyMetrics.fatMassLb,
          body_fat_pct: bodyMetrics.bodyFatPct,
          source: bodyMetrics.source,
        })
        .from(bodyMetrics)
        .orderBy(desc(bodyMetrics.measuredOn))
        .all();
      return toCsv(rows);
    }

    case "food": {
      const rows = db
        .select({
          date: foodLogEntries.loggedOn,
          meal: foodLogEntries.meal,
          food: foods.name,
          brand: foods.brand,
          servings: foodLogEntries.quantity,
          grams: foodLogEntries.servingGramsAtLog,
          calories: foodLogEntries.calories,
          protein_g: foodLogEntries.proteinG,
          carbs_g: foodLogEntries.carbsG,
          fat_g: foodLogEntries.fatG,
        })
        .from(foodLogEntries)
        .innerJoin(foods, eq(foods.id, foodLogEntries.foodId))
        .where(isNull(foodLogEntries.deletedAt))
        .orderBy(desc(foodLogEntries.loggedOn), asc(foodLogEntries.id))
        .all();
      return toCsv(rows);
    }

    case "supplements": {
      const rows = db
        .select({
          date: supplementLog.takenOn,
          supplement: supplements.name,
          dose: supplements.dose,
          unit: supplements.unit,
          slot: supplementSlots.name,
        })
        .from(supplementLog)
        .innerJoin(supplements, eq(supplements.id, supplementLog.supplementId))
        .leftJoin(supplementSlots, eq(supplementSlots.id, supplements.slotId))
        .orderBy(desc(supplementLog.takenOn))
        .all();
      return toCsv(rows);
    }
  }
}

export type TableCount = { label: string; count: number };

export function recordCounts(): TableCount[] {
  return [
    { label: "Workouts", count: db.select().from(workouts).all().length },
    { label: "Logged sets", count: db.select().from(exerciseSets).all().length },
    { label: "Body readings", count: db.select().from(bodyMetrics).all().length },
    { label: "Food entries", count: db.select().from(foodLogEntries).all().length },
    { label: "Supplement doses", count: db.select().from(supplementLog).all().length },
    { label: "Photos", count: db.select().from(progressPhotos).all().length },
    { label: "Cached foods", count: db.select().from(foods).all().length },
  ];
}
