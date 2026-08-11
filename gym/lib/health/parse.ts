import { formatInTimeZone } from "date-fns-tz";
import { env } from "../env";
import type { IsoDate } from "../dates";

/**
 * Health Auto Export sends different shapes depending on version and export mode.
 * Rather than pin to one, everything below reads defensively and skips what it
 * cannot understand. A payload that half-parses is better than a 400 on the phone,
 * where there is no way to see why.
 */

export type ParsedWorkout = {
  uuid: string | null;
  name: string;
  performedOn: IsoDate;
  startedAt: number | null;
  durationSec: number | null;
  activeKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
};

export type ParsedEnergy = {
  measuredOn: IsoDate;
  activeKcal: number | null;
  basalKcal: number | null;
};

export type ParsedBody = {
  measuredOn: IsoDate;
  weightLb: number | null;
  bodyFatPct: number | null;
  muscleMassLb: number | null;
  fatMassLb: number | null;
};

export type ParsedPayload = {
  workouts: ParsedWorkout[];
  energy: ParsedEnergy[];
  body: ParsedBody[];
};

const KG_TO_LB = 2.2046226218;

function obj(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const nested = obj(value);
  if (nested && "qty" in nested) return num(nested.qty);
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Health Auto Export stamps dates like "2026-08-11 06:14:22 -0500" — the local wall
 * clock plus its offset. Date can't parse that directly, so the space before the time
 * becomes a T and the offset gets its colon back.
 */
export function parseTimestamp(value: unknown): number | null {
  const raw = str(value);
  if (raw === null) return null;

  const normalised = raw
    .replace(" ", "T")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2")
    .replace(/\s+([+-]\d{2}:?\d{2})$/, "$1");

  const parsed = Date.parse(normalised);
  if (Number.isNaN(parsed)) return null;
  return Math.floor(parsed / 1000);
}

/**
 * A workout belongs to the day it happened in Kyle's time zone, not UTC. A 7pm
 * Tuesday session is Tuesday, even though UTC has already rolled over to Wednesday.
 */
export function isoDayFrom(unixSeconds: number): IsoDate {
  return formatInTimeZone(new Date(unixSeconds * 1000), env.DISPLAY_TIMEZONE, "yyyy-MM-dd");
}

function toLb(value: unknown, units: unknown): number | null {
  const raw = num(value);
  if (raw === null) return null;
  const unit = (str(units) ?? "").toLowerCase();
  if (unit === "kg" || unit === "kilograms") return Math.round(raw * KG_TO_LB * 10) / 10;
  return Math.round(raw * 10) / 10;
}

function parseWorkout(entry: unknown): ParsedWorkout | null {
  const row = obj(entry);
  if (!row) return null;

  const startedAt =
    parseTimestamp(row.start) ?? parseTimestamp(row.startDate) ?? parseTimestamp(row.date);
  if (startedAt === null) return null;

  const endedAt = parseTimestamp(row.end) ?? parseTimestamp(row.endDate);
  const durationRaw = num(row.duration);
  const durationSec =
    durationRaw !== null
      ? Math.round(durationRaw > 1000 ? durationRaw : durationRaw * 60)
      : endedAt !== null
        ? endedAt - startedAt
        : null;

  const heart = obj(row.heartRateData) ?? obj(row.heartRate);

  return {
    uuid: str(row.id) ?? str(row.uuid) ?? null,
    name: str(row.name) ?? str(row.workoutActivityType) ?? "Apple Health workout",
    performedOn: isoDayFrom(startedAt),
    startedAt,
    durationSec: durationSec !== null && durationSec > 0 ? durationSec : null,
    activeKcal: num(row.activeEnergyBurned) ?? num(row.activeEnergy) ?? null,
    avgHeartRate: heart ? num(heart.average) ?? num(heart.Avg) : num(row.avgHeartRate),
    maxHeartRate: heart ? num(heart.max) ?? num(heart.Max) : num(row.maxHeartRate),
  };
}

type MetricSample = { measuredOn: IsoDate; value: number };

function metricSamples(metric: Record<string, unknown>): MetricSample[] {
  const out: MetricSample[] = [];

  for (const raw of arr(metric.data)) {
    const sample = obj(raw);
    if (!sample) continue;

    const at = parseTimestamp(sample.date) ?? parseTimestamp(sample.startDate);
    if (at === null) continue;

    const value = num(sample.qty) ?? num(sample.value) ?? num(sample.Avg);
    if (value === null) continue;

    out.push({ measuredOn: isoDayFrom(at), value });
  }

  return out;
}

/**
 * Energy accumulates across a day, so multiple samples for one day are summed.
 * Body measurements do not — the last reading of the day is the one that stands.
 */
function sumByDay(samples: MetricSample[]): Map<IsoDate, number> {
  const totals = new Map<IsoDate, number>();
  for (const sample of samples) {
    totals.set(sample.measuredOn, (totals.get(sample.measuredOn) ?? 0) + sample.value);
  }
  return totals;
}

function lastByDay(samples: MetricSample[]): Map<IsoDate, number> {
  const latest = new Map<IsoDate, number>();
  for (const sample of samples) latest.set(sample.measuredOn, sample.value);
  return latest;
}

const ACTIVE_ENERGY = new Set(["active_energy", "active_energy_burned", "activeenergyburned"]);
const BASAL_ENERGY = new Set([
  "basal_energy_burned",
  "resting_energy",
  "basal_energy",
  "restingenergy",
]);

export function parsePayload(input: unknown): ParsedPayload {
  const root = obj(input);
  const data = root ? (obj(root.data) ?? root) : null;
  if (!data) return { workouts: [], energy: [], body: [] };

  const workouts = arr(data.workouts)
    .map(parseWorkout)
    .filter((w): w is ParsedWorkout => w !== null);

  const active = new Map<IsoDate, number>();
  const basal = new Map<IsoDate, number>();
  const weight = new Map<IsoDate, number>();
  const bodyFat = new Map<IsoDate, number>();
  const leanMass = new Map<IsoDate, number>();

  for (const raw of arr(data.metrics)) {
    const metric = obj(raw);
    if (!metric) continue;

    const name = (str(metric.name) ?? "").toLowerCase();
    const units = metric.units;
    const samples = metricSamples(metric);
    if (samples.length === 0) continue;

    if (ACTIVE_ENERGY.has(name)) {
      for (const [day, value] of sumByDay(samples)) active.set(day, value);
    } else if (BASAL_ENERGY.has(name)) {
      for (const [day, value] of sumByDay(samples)) basal.set(day, value);
    } else if (name === "weight_body_mass" || name === "body_mass" || name === "weight") {
      for (const [day, value] of lastByDay(samples)) {
        const lb = toLb(value, units);
        if (lb !== null) weight.set(day, lb);
      }
    } else if (name === "body_fat_percentage") {
      for (const [day, value] of lastByDay(samples)) {
        bodyFat.set(day, value <= 1 ? Math.round(value * 1000) / 10 : Math.round(value * 10) / 10);
      }
    } else if (name === "lean_body_mass") {
      for (const [day, value] of lastByDay(samples)) {
        const lb = toLb(value, units);
        if (lb !== null) leanMass.set(day, lb);
      }
    }
  }

  const energyDays = new Set([...active.keys(), ...basal.keys()]);
  const energy: ParsedEnergy[] = [...energyDays].sort().map((measuredOn) => ({
    measuredOn,
    activeKcal: active.has(measuredOn) ? Math.round(active.get(measuredOn)!) : null,
    basalKcal: basal.has(measuredOn) ? Math.round(basal.get(measuredOn)!) : null,
  }));

  const bodyDays = new Set([...weight.keys(), ...bodyFat.keys(), ...leanMass.keys()]);
  const body: ParsedBody[] = [...bodyDays].sort().map((measuredOn) => {
    const weightLb = weight.get(measuredOn) ?? null;
    const pct = bodyFat.get(measuredOn) ?? null;
    const lean = leanMass.get(measuredOn) ?? null;

    const fatMassLb =
      weightLb !== null && pct !== null
        ? Math.round(weightLb * (pct / 100) * 10) / 10
        : weightLb !== null && lean !== null
          ? Math.round((weightLb - lean) * 10) / 10
          : null;

    return { measuredOn, weightLb, bodyFatPct: pct, muscleMassLb: lean, fatMassLb };
  });

  return { workouts, energy, body };
}
