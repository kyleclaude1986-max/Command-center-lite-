import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workoutExercises } from "@/lib/db/schema";
import { asInt, asString, badRequest, notFound, ok, readJson, requireSession } from "@/lib/api";
import { addSet, moveExercise, removeExercise } from "@/lib/logbook";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  const entry = db.select().from(workoutExercises).where(eq(workoutExercises.id, id)).get();
  if (!entry) return notFound();

  const body = await readJson(request);

  if ("move" in body) {
    const direction = asString(body.move);
    if (direction !== "up" && direction !== "down") return badRequest("move must be up or down");
    return ok({ moved: moveExercise(id, direction) });
  }

  if (body.addSet === true || body.addWarmup === true) {
    return ok({ id: addSet(id, body.addWarmup === true) });
  }

  if ("notes" in body) {
    db.update(workoutExercises)
      .set({ notes: asString(body.notes) })
      .where(eq(workoutExercises.id, id))
      .run();
    return ok();
  }

  return badRequest("nothing to change");
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  removeExercise(id);
  return ok();
}
