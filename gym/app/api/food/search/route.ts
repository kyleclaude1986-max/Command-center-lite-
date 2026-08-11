import { badRequest, ok, requireSession } from "@/lib/api";
import { recentFoods, searchCachedFoods } from "@/lib/food/diary";
import { lookupBarcode, searchFoods, type FoodCandidate } from "@/lib/food/sources";
import type { Food } from "@/lib/db/schema";

type Result = {
  key: string;
  source: string;
  sourceId: string;
  foodId: number | null;
  name: string;
  brand: string | null;
  servingName: string;
  servingGrams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
};

function fromCached(food: Food): Result {
  return {
    key: `local:${food.id}`,
    source: food.source,
    sourceId: food.sourceId,
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    servingName: food.servingName,
    servingGrams: food.servingGrams,
    caloriesPer100g: food.caloriesPer100g,
    proteinPer100g: food.proteinPer100g,
    carbsPer100g: food.carbsPer100g,
    fatPer100g: food.fatPer100g,
  };
}

function fromCandidate(candidate: FoodCandidate): Result {
  return {
    key: `${candidate.source}:${candidate.sourceId}`,
    source: candidate.source,
    sourceId: candidate.sourceId,
    foodId: null,
    name: candidate.name,
    brand: candidate.brand,
    servingName: candidate.servingName,
    servingGrams: candidate.servingGrams,
    caloriesPer100g: candidate.caloriesPer100g,
    proteinPer100g: candidate.proteinPer100g,
    carbsPer100g: candidate.carbsPer100g,
    fatPer100g: candidate.fatPer100g,
  };
}

export async function GET(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const barcode = params.get("barcode")?.trim() ?? "";

  if (barcode) {
    if (!/^\d{6,14}$/.test(barcode)) return badRequest("that does not look like a barcode");
    const found = await lookupBarcode(barcode);
    if (!found) return ok({ results: [], notFound: true });
    return ok({ results: [fromCandidate(found)] });
  }

  const query = params.get("q")?.trim() ?? "";
  if (query.length === 0) {
    return ok({ results: recentFoods(20).map(fromCached), recent: true });
  }
  if (query.length < 2) return badRequest("search for at least two characters");

  /**
   * Local hits come back first and instantly; the remote lookup fills in behind them.
   * Most of what anyone eats they have eaten before, so the common case never waits
   * on a network round trip.
   */
  const cached = searchCachedFoods(query, 8).map(fromCached);
  const remote = (await searchFoods(query, 16)).map(fromCandidate);

  const seen = new Set(cached.map((r) => `${r.source}:${r.sourceId}`));
  const merged = [...cached, ...remote.filter((r) => !seen.has(`${r.source}:${r.sourceId}`))];

  return ok({ results: merged.slice(0, 24) });
}
