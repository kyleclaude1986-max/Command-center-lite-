import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { exercises, workoutPlans, workouts } from "@/lib/db/schema";
import { asInt, badRequest, notFound, ok, readJson, requireSession } from "@/lib/api";
import { addExercise, prefillFromPlan } from "@/lib/logbook";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const workoutId = asInt((await params).id);
  if (workoutId === null) return badRequest("bad id");

  const workout = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
  if (!workout || workout.deletedAt !== null) return notFound();

  const body = await readJson(request);

  if (body.fromPlan === true) {
    if (workout.planId === null) return badRequest("this workout has no plan");
    const plan = db.select().from(workoutPlans).where(eq(workoutPlans.id, workout.planId)).get();
    if (!plan) return badRequest("this workout has no plan");
    const added = prefillFromPlan(workoutId, plan.id);
    if (added === 0) return badRequest("nothing to copy across");
    return ok({ added });
  }

  const exerciseId = asInt(body.exerciseId);
  if (exerciseId === null) return badRequest("exerciseId is required");

  const exercise = db.select().from(exercises).where(eq(exercises.id, exerciseId)).get();
  if (!exercise) return badRequest("unknown exercise");
  if (exercise.archivedAt !== null) return badRequest("that exercise is archived");

  return ok({ id: addExercise(workoutId, exercise.id) });
}
