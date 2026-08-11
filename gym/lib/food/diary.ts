import { and, asc, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  foodLogEntries,
  foods,
  savedMealItems,
  savedMeals,
  MEALS,
} from "../db/schema";
import type { Food, FoodLogEntry, Meal } from "../db/schema";
import { todayIso, type IsoDate } from "../dates";
import type { FoodCandidate } from "./sources";
import { MEAL_LABELS } from "./labels";

export { MEAL_LABELS } from "./labels";

export function isMeal(value: unknown): value is Meal {
  return typeof value === "string" && (MEALS as readonly string[]).includes(value);
}

export type Macros = { calories: number; proteinG: number; carbsG: number; fatG: number };

export const ZERO_MACROS: Macros = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Everything is stored per 100 g, so a portion is grams divided by 100. Quantity is
 * a multiplier on the serving, which is how a label reads — "two bars" rather than
 * "94 grams" — but grams is what actually gets multiplied.
 */
export function macrosFor(food: Food, quantity: number, servingGrams: number): Macros {
  const factor = (quantity * servingGrams) / 100;
  return {
    calories: round(food.caloriesPer100g * factor),
    proteinG: round(food.proteinPer100g * factor),
    carbsG: round(food.carbsPer100g * factor),
    fatG: round(food.fatPer100g * factor),
  };
}

export function sumMacros(entries: { calories: number; proteinG: number; carbsG: number; fatG: number }[]): Macros {
  return entries.reduce<Macros>(
    (total, entry) => ({
      calories: total.calories + entry.calories,
      proteinG: total.proteinG + entry.proteinG,
      carbsG: total.carbsG + entry.carbsG,
      fatG: total.fatG + entry.fatG,
    }),
    { ...ZERO_MACROS }
  );
}

/**
 * A food from a database is cached locally the first time it is logged, so the diary
 * keeps working with no network and a search for something eaten before is instant.
 * Re-logging the same food updates the cached macros — brands reformulate.
 */
export function cacheFood(candidate: FoodCandidate): Food {
  const existing = db
    .select()
    .from(foods)
    .where(and(eq(foods.source, candidate.source), eq(foods.sourceId, candidate.sourceId)))
    .get();

  const values = {
    name: candidate.name,
    brand: candidate.brand,
    servingName: candidate.servingName,
    servingGrams: candidate.servingGrams,
    caloriesPer100g: candidate.caloriesPer100g,
    proteinPer100g: candidate.proteinPer100g,
    carbsPer100g: candidate.carbsPer100g,
    fatPer100g: candidate.fatPer100g,
    fiberPer100g: candidate.fiberPer100g,
    lastUsedAt: Math.floor(Date.now() / 1000),
  };

  if (existing) {
    db.update(foods).set(values).where(eq(foods.id, existing.id)).run();
    return { ...existing, ...values };
  }

  return db
    .insert(foods)
    .values({ source: candidate.source, sourceId: candidate.sourceId, ...values })
    .returning()
    .get();
}

export function customFood(input: {
  name: string;
  brand?: string | null;
  servingName?: string;
  servingGrams?: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}): Food {
  return db
    .insert(foods)
    .values({
      source: "custom",
      sourceId: `custom-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      name: input.name,
      brand: input.brand ?? null,
      servingName: input.servingName ?? "100 g",
      servingGrams: input.servingGrams ?? 100,
      caloriesPer100g: input.caloriesPer100g,
      proteinPer100g: input.proteinPer100g,
      carbsPer100g: input.carbsPer100g,
      fatPer100g: input.fatPer100g,
      lastUsedAt: Math.floor(Date.now() / 1000),
    })
    .returning()
    .get();
}

/**
 * Macros are snapshotted onto the entry at log time rather than read through to the
 * food on every page load. If a brand reformulates, what Kyle ate in March should
 * still read as what it was in March.
 */
export function logFood(input: {
  loggedOn: IsoDate;
  meal: Meal;
  foodId: number;
  quantity: number;
  servingGrams?: number;
}): { id: number } | { error: string } {
  const food = db.select().from(foods).where(eq(foods.id, input.foodId)).get();
  if (!food) return { error: "unknown food" };

  const servingGrams = input.servingGrams ?? food.servingGrams;
  const macros = macrosFor(food, input.quantity, servingGrams);

  const row = db
    .insert(foodLogEntries)
    .values({
      loggedOn: input.loggedOn,
      meal: input.meal,
      foodId: food.id,
      quantity: input.quantity,
      servingGramsAtLog: servingGrams,
      ...macros,
    })
    .returning({ id: foodLogEntries.id })
    .get();

  db.update(foods)
    .set({ lastUsedAt: Math.floor(Date.now() / 1000) })
    .where(eq(foods.id, food.id))
    .run();

  return { id: row.id };
}

export function removeEntry(id: number): void {
  db.update(foodLogEntries)
    .set({ deletedAt: Math.floor(Date.now() / 1000) })
    .where(eq(foodLogEntries.id, id))
    .run();
}

export function updateEntry(
  id: number,
  patch: { quantity?: number; meal?: Meal }
): boolean {
  const entry = db.select().from(foodLogEntries).where(eq(foodLogEntries.id, id)).get();
  if (!entry || entry.deletedAt !== null) return false;

  const values: Partial<typeof foodLogEntries.$inferInsert> = {};
  if (patch.meal) values.meal = patch.meal;

  if (patch.quantity !== undefined) {
    const food = db.select().from(foods).where(eq(foods.id, entry.foodId)).get();
    if (!food) return false;
    Object.assign(values, {
      quantity: patch.quantity,
      ...macrosFor(food, patch.quantity, entry.servingGramsAtLog),
    });
  }

  if (Object.keys(values).length === 0) return false;
  db.update(foodLogEntries).set(values).where(eq(foodLogEntries.id, id)).run();
  return true;
}

export type DiaryEntry = { entry: FoodLogEntry; food: Food };
export type MealGroup = { meal: Meal; label: string; entries: DiaryEntry[]; totals: Macros };

export function entriesOn(iso: IsoDate): DiaryEntry[] {
  return db
    .select({ entry: foodLogEntries, food: foods })
    .from(foodLogEntries)
    .innerJoin(foods, eq(foods.id, foodLogEntries.foodId))
    .where(and(eq(foodLogEntries.loggedOn, iso), isNull(foodLogEntries.deletedAt)))
    .orderBy(asc(foodLogEntries.id))
    .all();
}

export function diaryFor(iso: IsoDate = todayIso()): { groups: MealGroup[]; totals: Macros } {
  const rows = entriesOn(iso);

  const groups: MealGroup[] = MEALS.map((meal) => {
    const entries = rows.filter((row) => row.entry.meal === meal);
    return {
      meal,
      label: MEAL_LABELS[meal],
      entries,
      totals: sumMacros(entries.map((row) => row.entry)),
    };
  });

  return { groups, totals: sumMacros(rows.map((row) => row.entry)) };
}

export function totalsOn(iso: IsoDate): Macros {
  const row = db
    .select({
      calories: sql<number>`coalesce(sum(${foodLogEntries.calories}), 0)`,
      proteinG: sql<number>`coalesce(sum(${foodLogEntries.proteinG}), 0)`,
      carbsG: sql<number>`coalesce(sum(${foodLogEntries.carbsG}), 0)`,
      fatG: sql<number>`coalesce(sum(${foodLogEntries.fatG}), 0)`,
    })
    .from(foodLogEntries)
    .where(and(eq(foodLogEntries.loggedOn, iso), isNull(foodLogEntries.deletedAt)))
    .get();

  return {
    calories: round(row?.calories ?? 0),
    proteinG: round(row?.proteinG ?? 0),
    carbsG: round(row?.carbsG ?? 0),
    fatG: round(row?.fatG ?? 0),
  };
}

export function hasFoodOn(iso: IsoDate): boolean {
  return (
    db
      .select({ id: foodLogEntries.id })
      .from(foodLogEntries)
      .where(and(eq(foodLogEntries.loggedOn, iso), isNull(foodLogEntries.deletedAt)))
      .get() !== undefined
  );
}

export function recentFoods(limit = 20): Food[] {
  return db
    .select()
    .from(foods)
    .orderBy(desc(foods.lastUsedAt), desc(foods.id))
    .limit(limit)
    .all();
}

export function searchCachedFoods(query: string, limit = 20): Food[] {
  const term = `%${query.trim().toLowerCase()}%`;
  return db
    .select()
    .from(foods)
    .where(or(like(sql`lower(${foods.name})`, term), like(sql`lower(${foods.brand})`, term)))
    .orderBy(desc(foods.lastUsedAt), asc(foods.name))
    .limit(limit)
    .all();
}

export type SavedMealView = {
  id: number;
  name: string;
  meal: Meal;
  items: { food: Food; quantity: number; servingGrams: number }[];
  totals: Macros;
};

export function savedMealsList(): SavedMealView[] {
  const meals = db.select().from(savedMeals).orderBy(asc(savedMeals.name)).all();

  return meals.map((meal) => {
    const items = db
      .select({ item: savedMealItems, food: foods })
      .from(savedMealItems)
      .innerJoin(foods, eq(foods.id, savedMealItems.foodId))
      .where(eq(savedMealItems.savedMealId, meal.id))
      .orderBy(asc(savedMealItems.position))
      .all()
      .map(({ item, food }) => ({
        food,
        quantity: item.quantity,
        servingGrams: item.servingGrams,
      }));

    return {
      id: meal.id,
      name: meal.name,
      meal: meal.meal,
      items,
      totals: sumMacros(items.map((i) => macrosFor(i.food, i.quantity, i.servingGrams))),
    };
  });
}

/**
 * A saved meal is captured from what was actually logged, not built item by item in a
 * separate screen. The breakfast you eat every day is already in the diary.
 */
export function saveMealFromDay(
  name: string,
  iso: IsoDate,
  meal: Meal
): { id: number } | { error: string } {
  const entries = entriesOn(iso).filter((row) => row.entry.meal === meal);
  if (entries.length === 0) return { error: "nothing logged for that meal" };

  const created = db.insert(savedMeals).values({ name, meal }).returning({ id: savedMeals.id }).get();

  entries.forEach((row, index) => {
    db.insert(savedMealItems)
      .values({
        savedMealId: created.id,
        foodId: row.entry.foodId,
        quantity: row.entry.quantity,
        servingGrams: row.entry.servingGramsAtLog,
        position: index,
      })
      .run();
  });

  return { id: created.id };
}

export function logSavedMeal(savedMealId: number, iso: IsoDate, meal?: Meal): number {
  const saved = db.select().from(savedMeals).where(eq(savedMeals.id, savedMealId)).get();
  if (!saved) return 0;

  const items = db
    .select()
    .from(savedMealItems)
    .where(eq(savedMealItems.savedMealId, savedMealId))
    .orderBy(asc(savedMealItems.position))
    .all();

  let logged = 0;
  for (const item of items) {
    const result = logFood({
      loggedOn: iso,
      meal: meal ?? saved.meal,
      foodId: item.foodId,
      quantity: item.quantity,
      servingGrams: item.servingGrams,
    });
    if ("id" in result) logged += 1;
  }

  return logged;
}

export function deleteSavedMeal(id: number): void {
  db.delete(savedMeals).where(eq(savedMeals.id, id)).run();
}
