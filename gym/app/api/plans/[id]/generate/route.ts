import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workoutPlans, workoutSubtypes, workoutTypes } from "@/lib/db/schema";
import { asInt, badRequest, notFound, ok, requireSession } from "@/lib/api";
import { generateWorkout } from "@/lib/ai/workout-generator";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  const plan = db.select().from(workoutPlans).where(eq(workoutPlans.id, id)).get();
  if (!plan) return notFound();

  const type = db
    .select()
    .from(workoutTypes)
    .where(eq(workoutTypes.id, plan.workoutTypeId))
    .get();
  if (!type) return badRequest("plan has no workout type");
  if (!type.supportsPlanning) return badRequest(`${type.name} is not set up for planning`);

  const subtype =
    plan.workoutSubtypeId === null
      ? null
      : (db
          .select()
          .from(workoutSubtypes)
          .where(eq(workoutSubtypes.id, plan.workoutSubtypeId))
          .get() ?? null);

  const outcome = await generateWorkout(plan, type, subtype);

  return ok({
    source: outcome.source,
    summary: outcome.summary,
    exercises: outcome.exercises.length,
    error: outcome.error,
  });
}
