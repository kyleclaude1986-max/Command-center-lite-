import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { dailyEnergy, healthIngests, workouts, workoutTypes } from "../db/schema";
import { recordMetrics } from "../body";
import { APPLE_HEALTH_TYPE_SLUG } from "../seed-data";
import { parsePayload, type ParsedPayload, type ParsedWorkout } from "./parse";

export type IngestResult = {
  ingestId: number;
  workoutsWritten: number;
  workoutsMatched: number;
  energyWritten: number;
  bodyWritten: number;
};

function importTypeId(): number {
  const row = db
    .select({ id: workoutTypes.id })
    .from(workoutTypes)
    .where(eq(workoutTypes.slug, APPLE_HEALTH_TYPE_SLUG))
    .get();
  if (!row) throw new Error(`missing the ${APPLE_HEALTH_TYPE_SLUG} workout type`);
  return row.id;
}

/**
 * A session Kyle already logged by hand is the same session the Watch recorded. Rather
 * than create a second row, the Watch's duration and heart rate attach to the one he
 * logged — which is also what makes the cardio minimum work without him typing minutes.
 *
 * The match is same-day and duration-less: a hand-logged workout with no duration is
 * waiting for exactly this. One that already has a duration is left alone, because he
 * typed that number deliberately.
 */
function attachToExisting(parsed: ParsedWorkout): boolean {
  const candidate = db
    .select({ id: workouts.id })
    .from(workouts)
    .innerJoin(workoutTypes, eq(workoutTypes.id, workouts.workoutTypeId))
    .where(
      and(
        eq(workouts.performedOn, parsed.performedOn),
        isNull(workouts.durationSec),
        isNull(workouts.deletedAt),
        isNull(workouts.appleHealthUuid),
        sql`${workoutTypes.slug} <> ${APPLE_HEALTH_TYPE_SLUG}`
      )
    )
    .orderBy(workouts.id)
    .get();

  if (!candidate) return false;

  db.update(workouts)
    .set({
      durationSec: parsed.durationSec,
      durationSource: "apple_health",
      startedAt: parsed.startedAt,
      caloriesKcal: parsed.activeKcal === null ? null : Math.round(parsed.activeKcal),
      avgHeartRate: parsed.avgHeartRate === null ? null : Math.round(parsed.avgHeartRate),
      maxHeartRate: parsed.maxHeartRate === null ? null : Math.round(parsed.maxHeartRate),
      appleHealthUuid: parsed.uuid,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(workouts.id, candidate.id))
    .run();

  return true;
}

function alreadyImported(uuid: string | null): boolean {
  if (uuid === null) return false;
  return (
    db.select({ id: workouts.id }).from(workouts).where(eq(workouts.appleHealthUuid, uuid)).get() !==
    undefined
  );
}

export function applyPayload(parsed: ParsedPayload): Omit<IngestResult, "ingestId"> {
  let workoutsWritten = 0;
  let workoutsMatched = 0;
  let energyWritten = 0;
  let bodyWritten = 0;

  const typeId = importTypeId();

  for (const workout of parsed.workouts) {
    if (alreadyImported(workout.uuid)) continue;

    if (attachToExisting(workout)) {
      workoutsMatched += 1;
      continue;
    }

    db.insert(workouts)
      .values({
        performedOn: workout.performedOn,
        workoutTypeId: typeId,
        startedAt: workout.startedAt,
        durationSec: workout.durationSec,
        durationSource: "apple_health",
        caloriesKcal: workout.activeKcal === null ? null : Math.round(workout.activeKcal),
        avgHeartRate: workout.avgHeartRate === null ? null : Math.round(workout.avgHeartRate),
        maxHeartRate: workout.maxHeartRate === null ? null : Math.round(workout.maxHeartRate),
        notes: workout.name,
        appleHealthUuid: workout.uuid,
        calendarSyncState: "skipped",
      })
      .run();
    workoutsWritten += 1;
  }

  /**
   * Energy is replaced per day, never added to. The phone re-sends the whole day on
   * every export, so summing would inflate the burn every time it fires — which would
   * quietly turn every day into a deficit.
   */
  for (const day of parsed.energy) {
    db.insert(dailyEnergy)
      .values({
        measuredOn: day.measuredOn,
        activeKcal: day.activeKcal,
        basalKcal: day.basalKcal,
        source: "apple_health",
      })
      .onConflictDoUpdate({
        target: dailyEnergy.measuredOn,
        set: {
          activeKcal: day.activeKcal,
          basalKcal: day.basalKcal,
          source: "apple_health",
          updatedAt: Math.floor(Date.now() / 1000),
        },
      })
      .run();
    energyWritten += 1;
  }

  for (const measurement of parsed.body) {
    const values = {
      weightLb: measurement.weightLb,
      bodyFatPct: measurement.bodyFatPct,
      muscleMassLb: measurement.muscleMassLb,
      fatMassLb: measurement.fatMassLb,
    };
    if (Object.values(values).every((value) => value === null)) continue;

    recordMetrics(measurement.measuredOn, values, "apple_health");
    bodyWritten += 1;
  }

  return { workoutsWritten, workoutsMatched, energyWritten, bodyWritten };
}

export function ingest(raw: unknown, rawText: string): IngestResult {
  const record = db
    .insert(healthIngests)
    .values({ payload: rawText.slice(0, 200_000), status: "received" })
    .returning({ id: healthIngests.id })
    .get();

  try {
    const applied = applyPayload(parsePayload(raw));

    db.update(healthIngests)
      .set({
        status: "applied",
        workoutsWritten: applied.workoutsWritten + applied.workoutsMatched,
        metricsWritten: applied.energyWritten + applied.bodyWritten,
      })
      .where(eq(healthIngests.id, record.id))
      .run();

    return { ingestId: record.id, ...applied };
  } catch (error) {
    db.update(healthIngests)
      .set({ status: "failed", error: error instanceof Error ? error.message : "unknown error" })
      .where(eq(healthIngests.id, record.id))
      .run();
    throw error;
  }
}
