import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { PLAN_STATUSES, workoutPlans, workoutSubtypes } from "@/lib/db/schema";
import type { PlanStatus } from "@/lib/db/schema";
import { asInt, asString, badRequest, notFound, ok, readJson, requireSession } from "@/lib/api";
import { planParamError } from "@/lib/planning";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  const plan = db.select().from(workoutPlans).where(eq(workoutPlans.id, id)).get();
  if (!plan) return notFound();

  const body = await readJson(request);
  const patch: Partial<typeof workoutPlans.$inferInsert> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };
  let touchedParams = false;

  if ("status" in body) {
    const status = asString(body.status) as PlanStatus | null;
    if (!status || !PLAN_STATUSES.includes(status)) return badRequest("unknown status");
    patch.status = status;
  }

  for (const key of ["targetRepsLow", "targetRepsHigh", "restSeconds", "exerciseCount"] as const) {
    if (!(key in body)) continue;
    const value = asInt(body[key]);
    if (value === null) return badRequest(`${key} must be a number`);
    patch[key] = value;
    touchedParams = true;
  }

  if (touchedParams) {
    const invalid = planParamError({
      targetRepsLow: patch.targetRepsLow ?? plan.targetRepsLow,
      targetRepsHigh: patch.targetRepsHigh ?? plan.targetRepsHigh,
      restSeconds: patch.restSeconds ?? plan.restSeconds,
      exerciseCount: patch.exerciseCount ?? plan.exerciseCount,
    });
    if (invalid) return badRequest(invalid);
  }

  if ("workoutSubtypeId" in body) {
    const subtypeId = asInt(body.workoutSubtypeId);
    if (subtypeId === null) {
      patch.workoutSubtypeId = null;
    } else {
      const subtype = db
        .select()
        .from(workoutSubtypes)
        .where(eq(workoutSubtypes.id, subtypeId))
        .get();
      if (!subtype || subtype.workoutTypeId !== plan.workoutTypeId) {
        return badRequest("unknown subtype for this workout type");
      }
      patch.workoutSubtypeId = subtype.id;
    }
    touchedParams = true;
  }

  if ("notes" in body) patch.notes = asString(body.notes);

  if (touchedParams) patch.isOverride = true;

  db.update(workoutPlans).set(patch).where(eq(workoutPlans.id, id)).run();
  return ok();
}
