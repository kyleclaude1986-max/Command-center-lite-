import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "./db/client";
import { dailyEnergy, foodLogEntries } from "./db/schema";
import { todayIso, type IsoDate } from "./dates";

export type DayEnergy = {
  measuredOn: IsoDate;
  eatenKcal: number;
  activeKcal: number | null;
  basalKcal: number | null;
  burnedKcal: number | null;
  netKcal: number | null;
  hasFood: boolean;
};

export function eatenOn(iso: IsoDate): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${foodLogEntries.calories}), 0)` })
    .from(foodLogEntries)
    .where(and(eq(foodLogEntries.loggedOn, iso), isNull(foodLogEntries.deletedAt)))
    .get();
  return Math.round(row?.total ?? 0);
}

export function energyOn(iso: IsoDate = todayIso()): DayEnergy {
  const stored = db.select().from(dailyEnergy).where(eq(dailyEnergy.measuredOn, iso)).get();
  const eatenKcal = eatenOn(iso);

  const activeKcal = stored?.activeKcal ?? null;
  const basalKcal = stored?.basalKcal ?? null;

  /**
   * Net is eaten minus active plus resting. Both halves of the burn matter — active
   * energy alone ignores the ~1,800 calories a body spends existing, which would make
   * every single day read as a large surplus. A number that looks meaningful and isn't
   * is worse than no number, so a day missing either half reads unavailable instead.
   */
  const burnedKcal =
    activeKcal === null || basalKcal === null ? null : Math.round(activeKcal + basalKcal);

  return {
    measuredOn: iso,
    eatenKcal,
    activeKcal,
    basalKcal,
    burnedKcal,
    netKcal: burnedKcal === null ? null : eatenKcal - burnedKcal,
    hasFood: eatenKcal > 0,
  };
}

export function energyInRange(fromIso: IsoDate, toIso: IsoDate): DayEnergy[] {
  const stored = db
    .select()
    .from(dailyEnergy)
    .where(and(gte(dailyEnergy.measuredOn, fromIso), lte(dailyEnergy.measuredOn, toIso)))
    .all();

  const byDay = new Map(stored.map((row) => [row.measuredOn, row]));
  const eaten = db
    .select({
      loggedOn: foodLogEntries.loggedOn,
      total: sql<number>`coalesce(sum(${foodLogEntries.calories}), 0)`,
    })
    .from(foodLogEntries)
    .where(
      and(
        gte(foodLogEntries.loggedOn, fromIso),
        lte(foodLogEntries.loggedOn, toIso),
        isNull(foodLogEntries.deletedAt)
      )
    )
    .groupBy(foodLogEntries.loggedOn)
    .all();

  const days = new Set([...byDay.keys(), ...eaten.map((row) => row.loggedOn)]);
  const eatenByDay = new Map(eaten.map((row) => [row.loggedOn, Math.round(row.total)]));

  return [...days].sort().map((measuredOn) => {
    const row = byDay.get(measuredOn) ?? null;
    const activeKcal = row?.activeKcal ?? null;
    const basalKcal = row?.basalKcal ?? null;
    const burnedKcal =
      activeKcal === null || basalKcal === null ? null : Math.round(activeKcal + basalKcal);
    const eatenKcal = eatenByDay.get(measuredOn) ?? 0;

    return {
      measuredOn,
      eatenKcal,
      activeKcal,
      basalKcal,
      burnedKcal,
      netKcal: burnedKcal === null ? null : eatenKcal - burnedKcal,
      hasFood: eatenKcal > 0,
    };
  });
}

export function recordEnergy(
  measuredOn: IsoDate,
  values: { activeKcal?: number | null; basalKcal?: number | null },
  source: "manual" | "apple_health" = "manual"
): void {
  const existing = db.select().from(dailyEnergy).where(eq(dailyEnergy.measuredOn, measuredOn)).get();

  if (existing) {
    const patch: { activeKcal?: number | null; basalKcal?: number | null; updatedAt: number; source: typeof source } = {
      updatedAt: Math.floor(Date.now() / 1000),
      source,
    };
    if ("activeKcal" in values) patch.activeKcal = values.activeKcal ?? null;
    if ("basalKcal" in values) patch.basalKcal = values.basalKcal ?? null;
    db.update(dailyEnergy).set(patch).where(eq(dailyEnergy.id, existing.id)).run();
    return;
  }

  db.insert(dailyEnergy)
    .values({
      measuredOn,
      activeKcal: values.activeKcal ?? null,
      basalKcal: values.basalKcal ?? null,
      source,
    })
    .run();
}
