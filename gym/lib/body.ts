import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "./db/client";
import { bodyMetrics } from "./db/schema";
import type { BodyMetric } from "./db/schema";
import { addDaysIso, todayIso, type IsoDate } from "./dates";
import { METRIC_KEYS, METRIC_LABELS, METRIC_UNITS, type MetricKey } from "./labels";

export { METRIC_KEYS, METRIC_LABELS, METRIC_UNITS, type MetricKey } from "./labels";

export type MetricInput = Partial<Record<MetricKey, number | null>>;

/**
 * Body composition is measured, not accumulated — two readings on one day means the
 * second replaced the first, not that they add up. So an entry for a day that already
 * has one merges into it, and a field left blank leaves whatever was already recorded
 * alone rather than wiping it.
 */
export function recordMetrics(
  measuredOn: IsoDate,
  values: MetricInput,
  source: "manual" | "apple_health" = "manual"
): { id: number; created: boolean } {
  const provided = METRIC_KEYS.filter((key) => key in values);
  const existing = db
    .select()
    .from(bodyMetrics)
    .where(eq(bodyMetrics.measuredOn, measuredOn))
    .orderBy(desc(bodyMetrics.id))
    .get();

  if (existing) {
    const patch: MetricInput = {};
    for (const key of provided) patch[key] = values[key] ?? null;
    db.update(bodyMetrics).set(patch).where(eq(bodyMetrics.id, existing.id)).run();
    return { id: existing.id, created: false };
  }

  const row = db
    .insert(bodyMetrics)
    .values({
      measuredOn,
      weightLb: values.weightLb ?? null,
      muscleMassLb: values.muscleMassLb ?? null,
      fatMassLb: values.fatMassLb ?? null,
      bodyFatPct: values.bodyFatPct ?? null,
      source,
    })
    .returning({ id: bodyMetrics.id })
    .get();

  return { id: row.id, created: true };
}

export function removeMetrics(id: number): void {
  db.delete(bodyMetrics).where(eq(bodyMetrics.id, id)).run();
}

export function metricsInRange(fromIso: IsoDate, toIso: IsoDate): BodyMetric[] {
  return db
    .select()
    .from(bodyMetrics)
    .where(and(gte(bodyMetrics.measuredOn, fromIso), lte(bodyMetrics.measuredOn, toIso)))
    .orderBy(asc(bodyMetrics.measuredOn), asc(bodyMetrics.id))
    .all();
}

export function recentMetrics(limit = 30): BodyMetric[] {
  return db
    .select()
    .from(bodyMetrics)
    .orderBy(desc(bodyMetrics.measuredOn), desc(bodyMetrics.id))
    .limit(limit)
    .all();
}

export function latestMetrics(): BodyMetric | null {
  return (
    db
      .select()
      .from(bodyMetrics)
      .orderBy(desc(bodyMetrics.measuredOn), desc(bodyMetrics.id))
      .get() ?? null
  );
}

export type MetricPoint = { measuredOn: IsoDate; value: number };

export type MetricSeries = {
  key: MetricKey;
  label: string;
  unit: string;
  points: MetricPoint[];
  latest: number | null;
  change: number | null;
};

/**
 * The change is measured against the oldest reading in the window, not the previous
 * one. Day-to-day body weight swings on water and timing; over ninety days the
 * direction is the only part that means anything.
 */
export function seriesFor(
  key: MetricKey,
  days = 90,
  today: IsoDate = todayIso()
): MetricSeries {
  const rows = metricsInRange(addDaysIso(today, -(days - 1)), today);
  const points: MetricPoint[] = [];

  for (const row of rows) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    points.push({ measuredOn: row.measuredOn, value });
  }

  const first = points[0]?.value ?? null;
  const latest = points[points.length - 1]?.value ?? null;

  return {
    key,
    label: METRIC_LABELS[key],
    unit: METRIC_UNITS[key],
    points,
    latest,
    change: first === null || latest === null || points.length < 2 ? null : latest - first,
  };
}

export function allSeries(days = 90, today: IsoDate = todayIso()): MetricSeries[] {
  return METRIC_KEYS.map((key) => seriesFor(key, days, today));
}

/**
 * Fat mass and muscle mass are usually reported by the scale, but body fat percentage
 * often is not — and it is derivable when weight and fat mass are both known. Filling
 * it in beats leaving a chart empty over a number the data already contains.
 */
export function derivedBodyFatPct(metric: BodyMetric): number | null {
  if (metric.bodyFatPct !== null) return metric.bodyFatPct;
  if (metric.weightLb === null || metric.fatMassLb === null) return null;
  if (metric.weightLb <= 0) return null;
  return Math.round((metric.fatMassLb / metric.weightLb) * 1000) / 10;
}
