import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { MACRO_DIRECTIONS, macroTargets, workoutTypes } from "@/lib/db/schema";
import type { MacroDirection } from "@/lib/db/schema";
import { asFloat, asInt, asString, badRequest, ok, readJson, requireSession } from "@/lib/api";
import { isElevated } from "@/lib/admin-auth";
import { REST_DAY_SCOPE } from "@/lib/macros";

const LIMITS: Record<string, number> = {
  calories: 10000,
  proteinG: 1000,
  carbsG: 2000,
  fatG: 1000,
};

const DIRECTION_FIELDS = {
  caloriesDirection: "caloriesDirection",
  proteinDirection: "proteinDirection",
  carbsDirection: "carbsDirection",
  fatDirection: "fatDirection",
} as const;

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  if (!(await isElevated())) return badRequest("re-enter your password in admin first");

  const body = await readJson(request);

  const scopeKey = asInt(body.scopeKey);
  if (scopeKey === null || scopeKey < 0) return badRequest("bad scope");

  let workoutTypeId: number | null = null;
  if (scopeKey !== REST_DAY_SCOPE) {
    const type = db.select().from(workoutTypes).where(eq(workoutTypes.id, scopeKey)).get();
    if (!type) return badRequest("unknown workout type");
    workoutTypeId = type.id;
  }

  const values: Record<string, number | string> = {};

  for (const [key, max] of Object.entries(LIMITS)) {
    if (!(key in body)) continue;
    const value = asFloat(body[key]);
    if (value === null || value < 0 || value > max) {
      return badRequest(`${key} must be between 0 and ${max}`);
    }
    values[key] = value;
  }

  for (const field of Object.keys(DIRECTION_FIELDS)) {
    if (!(field in body)) continue;
    const direction = asString(body[field]) as MacroDirection | null;
    if (!direction || !MACRO_DIRECTIONS.includes(direction)) {
      return badRequest(`${field} must be one of ${MACRO_DIRECTIONS.join(", ")}`);
    }
    values[field] = direction;
  }

  if ("tolerancePct" in body) {
    const tolerance = asFloat(body.tolerancePct);
    if (tolerance === null || tolerance < 0 || tolerance > 50) {
      return badRequest("tolerance must be between 0 and 50 percent");
    }
    values.tolerancePct = tolerance;
  }

  if (Object.keys(values).length === 0) return badRequest("nothing to change");

  const existing = db.select().from(macroTargets).where(eq(macroTargets.scopeKey, scopeKey)).get();

  if (existing) {
    db.update(macroTargets)
      .set({ ...values, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(macroTargets.id, existing.id))
      .run();
    return ok({ id: existing.id, created: false });
  }

  const fallback = db
    .select()
    .from(macroTargets)
    .where(eq(macroTargets.scopeKey, REST_DAY_SCOPE))
    .get();

  const row = db
    .insert(macroTargets)
    .values({
      scopeKey,
      workoutTypeId,
      calories: fallback?.calories ?? 2200,
      proteinG: fallback?.proteinG ?? 180,
      carbsG: fallback?.carbsG ?? 200,
      fatG: fallback?.fatG ?? 70,
      ...values,
    })
    .returning({ id: macroTargets.id })
    .get();

  return ok({ id: row.id, created: true });
}

export async function DELETE(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  if (!(await isElevated())) return badRequest("re-enter your password in admin first");

  const scopeKey = asInt(new URL(request.url).searchParams.get("scopeKey"));
  if (scopeKey === null) return badRequest("scopeKey is required");
  if (scopeKey === REST_DAY_SCOPE) return badRequest("the rest-day default cannot be removed");

  db.delete(macroTargets).where(eq(macroTargets.scopeKey, scopeKey)).run();
  return ok();
}
