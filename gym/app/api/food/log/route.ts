import { asFloat, asInt, asString, badRequest, ok, readJson, requireSession } from "@/lib/api";
import { isValidIso, todayIso } from "@/lib/dates";
import { cacheFood, customFood, isMeal, logFood, logSavedMeal } from "@/lib/food/diary";
import type { FoodCandidate } from "@/lib/food/sources";

const MAX_QUANTITY = 100;
const MAX_PER_100G = 2000;

function asCandidate(raw: unknown): FoodCandidate | { error: string } {
  const body = raw as Record<string, unknown>;

  const source = asString(body.source);
  const sourceId = asString(body.sourceId);
  const name = asString(body.name);
  if (source !== "off" && source !== "usda") return { error: "unknown food source" };
  if (!sourceId || !name) return { error: "that food is missing its identity" };

  const numbers: Record<string, number> = {};
  for (const key of ["caloriesPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g"]) {
    const value = asFloat(body[key]);
    if (value === null || value < 0 || value > MAX_PER_100G) {
      return { error: `${key} is out of range` };
    }
    numbers[key] = value;
  }

  const servingGrams = asFloat(body.servingGrams);

  return {
    source,
    sourceId,
    name,
    brand: asString(body.brand),
    servingName: asString(body.servingName) ?? "100 g",
    servingGrams: servingGrams !== null && servingGrams > 0 ? servingGrams : 100,
    caloriesPer100g: numbers.caloriesPer100g!,
    proteinPer100g: numbers.proteinPer100g!,
    carbsPer100g: numbers.carbsPer100g!,
    fatPer100g: numbers.fatPer100g!,
    fiberPer100g: asFloat(body.fiberPer100g),
  };
}

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await readJson(request);

  const loggedOn = asString(body.loggedOn) ?? todayIso();
  if (!isValidIso(loggedOn)) return badRequest("loggedOn must be YYYY-MM-DD");

  const mealRaw = body.meal ?? "snack";
  if (!isMeal(mealRaw)) return badRequest("unknown meal");

  const savedMealId = asInt(body.savedMealId);
  if (savedMealId !== null) {
    const logged = logSavedMeal(savedMealId, loggedOn, isMeal(body.meal) ? body.meal : undefined);
    if (logged === 0) return badRequest("that saved meal has nothing in it");
    return ok({ logged });
  }

  const quantity = asFloat(body.quantity) ?? 1;
  if (quantity <= 0 || quantity > MAX_QUANTITY) {
    return badRequest(`quantity must be between 0 and ${MAX_QUANTITY}`);
  }

  let foodId = asInt(body.foodId);

  if (foodId === null && body.custom === true) {
    const name = asString(body.name);
    if (!name) return badRequest("give the food a name");
    const numbers: Record<string, number> = {};
    for (const key of ["caloriesPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g"]) {
      const value = asFloat(body[key]);
      if (value === null || value < 0 || value > MAX_PER_100G) {
        return badRequest(`${key} is out of range`);
      }
      numbers[key] = value;
    }
    const servingGrams = asFloat(body.servingGrams);
    foodId = customFood({
      name,
      brand: asString(body.brand),
      servingName: asString(body.servingName) ?? "100 g",
      servingGrams: servingGrams !== null && servingGrams > 0 ? servingGrams : 100,
      caloriesPer100g: numbers.caloriesPer100g!,
      proteinPer100g: numbers.proteinPer100g!,
      carbsPer100g: numbers.carbsPer100g!,
      fatPer100g: numbers.fatPer100g!,
    }).id;
  }

  if (foodId === null) {
    const candidate = asCandidate(body);
    if ("error" in candidate) return badRequest(candidate.error);
    foodId = cacheFood(candidate).id;
  }

  const servingGrams = asFloat(body.servingGrams);
  const result = logFood({
    loggedOn,
    meal: mealRaw,
    foodId,
    quantity,
    servingGrams: servingGrams !== null && servingGrams > 0 ? servingGrams : undefined,
  });

  if ("error" in result) return badRequest(result.error);
  return ok(result);
}
