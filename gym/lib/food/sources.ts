import { env } from "../env";

/**
 * Both databases are normalised to macros per 100 g on the way in, so the diary never
 * has to care which one a food came from. Serving size is kept alongside as a
 * convenience, not as the unit of storage — brands change pack sizes, and a diary
 * entry recorded against "1 bar" would silently mean something different afterwards.
 */
export type FoodCandidate = {
  source: "off" | "usda";
  sourceId: string;
  name: string;
  brand: string | null;
  servingName: string;
  servingGrams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
};

const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_BARCODE = "https://world.openfoodfacts.org/api/v2/product";
const USDA_SEARCH = "https://api.nal.usda.gov/fdc/v1/foods/search";

const TIMEOUT_MS = 6000;

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": env.OFF_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function obj(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

const KJ_PER_KCAL = 4.184;

export function offProductToCandidate(raw: unknown): FoodCandidate | null {
  const product = obj(raw);
  if (!product) return null;

  const code = str(product.code) ?? str(product._id);
  const name = str(product.product_name) ?? str(product.generic_name);
  if (!code || !name) return null;

  const n = obj(product.nutriments);
  if (!n) return null;

  const kcal =
    num(n["energy-kcal_100g"]) ??
    (num(n["energy_100g"]) === null ? null : round(num(n["energy_100g"])! / KJ_PER_KCAL));
  const protein = num(n["proteins_100g"]);
  const carbs = num(n["carbohydrates_100g"]);
  const fat = num(n["fat_100g"]);

  if (kcal === null || protein === null || carbs === null || fat === null) return null;

  const servingGrams = num(product.serving_quantity);

  return {
    source: "off",
    sourceId: code,
    name,
    brand: str(product.brands),
    servingName: str(product.serving_size) ?? "100 g",
    servingGrams: servingGrams !== null && servingGrams > 0 ? servingGrams : 100,
    caloriesPer100g: round(kcal),
    proteinPer100g: round(protein),
    carbsPer100g: round(carbs),
    fatPer100g: round(fat),
    fiberPer100g: num(n["fiber_100g"]) === null ? null : round(num(n["fiber_100g"])!),
  };
}

export async function searchOpenFoodFacts(query: string, limit = 12): Promise<FoodCandidate[]> {
  const url = `${OFF_SEARCH}?${new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(limit),
    fields:
      "code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments",
  })}`;

  const body = obj(await getJson(url));
  if (!body || !Array.isArray(body.products)) return [];

  return body.products
    .map(offProductToCandidate)
    .filter((c): c is FoodCandidate => c !== null)
    .slice(0, limit);
}

export async function lookupBarcode(barcode: string): Promise<FoodCandidate | null> {
  if (!/^\d{6,14}$/.test(barcode)) return null;

  const url = `${OFF_BARCODE}/${barcode}.json?fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments`;
  const body = obj(await getJson(url));
  if (!body || body.status === 0) return null;

  return offProductToCandidate(body.product);
}

const USDA_NUTRIENTS: Record<number, keyof FoodCandidate> = {
  1008: "caloriesPer100g",
  1003: "proteinPer100g",
  1005: "carbsPer100g",
  1004: "fatPer100g",
  1079: "fiberPer100g",
};

export function usdaFoodToCandidate(raw: unknown): FoodCandidate | null {
  const food = obj(raw);
  if (!food) return null;

  const fdcId = num(food.fdcId);
  const name = str(food.description);
  if (fdcId === null || !name) return null;

  const macros: Partial<Record<keyof FoodCandidate, number>> = {};
  for (const entry of Array.isArray(food.foodNutrients) ? food.foodNutrients : []) {
    const nutrient = obj(entry);
    if (!nutrient) continue;
    const id = num(nutrient.nutrientId) ?? num(obj(nutrient.nutrient)?.id);
    const value = num(nutrient.value) ?? num(nutrient.amount);
    if (id === null || value === null) continue;
    const key = USDA_NUTRIENTS[id];
    if (key) macros[key] = round(value);
  }

  if (
    macros.caloriesPer100g === undefined ||
    macros.proteinPer100g === undefined ||
    macros.carbsPer100g === undefined ||
    macros.fatPer100g === undefined
  ) {
    return null;
  }

  const servingGrams = num(food.servingSize);
  const servingUnit = (str(food.servingSizeUnit) ?? "g").toLowerCase();
  const grams = servingGrams !== null && servingUnit === "g" && servingGrams > 0 ? servingGrams : 100;

  return {
    source: "usda",
    sourceId: String(fdcId),
    name,
    brand: str(food.brandOwner) ?? str(food.brandName),
    servingName: grams === 100 ? "100 g" : `${grams} g`,
    servingGrams: grams,
    caloriesPer100g: macros.caloriesPer100g,
    proteinPer100g: macros.proteinPer100g,
    carbsPer100g: macros.carbsPer100g,
    fatPer100g: macros.fatPer100g,
    fiberPer100g: macros.fiberPer100g ?? null,
  };
}

export async function searchUsda(query: string, limit = 12): Promise<FoodCandidate[]> {
  if (!env.USDA_FDC_API_KEY) return [];

  const url = `${USDA_SEARCH}?${new URLSearchParams({
    api_key: env.USDA_FDC_API_KEY,
    query,
    pageSize: String(limit),
    dataType: "Foundation,SR Legacy,Branded",
  })}`;

  const body = obj(await getJson(url));
  if (!body || !Array.isArray(body.foods)) return [];

  return body.foods
    .map(usdaFoodToCandidate)
    .filter((c): c is FoodCandidate => c !== null)
    .slice(0, limit);
}

/**
 * Both databases are queried at once and the results interleaved, so neither one
 * dominates the first screen. USDA is more accurate for whole foods and Open Food
 * Facts has the barcodes, and which you want depends on what you are eating.
 */
export async function searchFoods(query: string, limit = 16): Promise<FoodCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const [off, usda] = await Promise.all([
    searchOpenFoodFacts(trimmed, limit),
    searchUsda(trimmed, limit),
  ]);

  const merged: FoodCandidate[] = [];
  for (let i = 0; i < Math.max(off.length, usda.length); i += 1) {
    if (usda[i]) merged.push(usda[i]!);
    if (off[i]) merged.push(off[i]!);
  }

  const seen = new Set<string>();
  return merged
    .filter((candidate) => {
      const key = `${candidate.source}:${candidate.sourceId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
