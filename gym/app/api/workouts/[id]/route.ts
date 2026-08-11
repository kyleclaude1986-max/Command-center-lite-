import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workouts, workoutSubtypes, workoutTypes } from "@/lib/db/schema";
import { asInt, asString, badRequest, notFound, ok, readJson, requireSession } from "@/lib/api";
import { isValidIso } from "@/lib/dates";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  const existing = db.select().from(workouts).where(eq(workouts.id, id)).get();
  if (!existing || existing.deletedAt !== null) return notFound();

  const body = await readJson(request);
  const patch: Partial<typeof workouts.$inferInsert> = { updatedAt: Math.floor(Date.now() / 1000) };

  if ("rating" in body) {
    const rating = asInt(body.rating);
    if (rating !== null && (rating < 1 || rating > 5)) return badRequest("rating must be 1-5");
    patch.rating = rating;
  }

  if ("durationMinutes" in body) {
    const minutes = asInt(body.durationMinutes);
    patch.durationSec = minutes === null ? null : minutes * 60;
    patch.durationSource = minutes === null ? null : "manual";
  }

  if ("notes" in body) patch.notes = asString(body.notes);

  if ("performedOn" in body) {
    const performedOn = asString(body.performedOn);
    if (!performedOn || !isValidIso(performedOn)) return badRequest("performedOn must be YYYY-MM-DD");
    patch.performedOn = performedOn;
  }

  if ("workoutTypeId" in body) {
    const workoutTypeId = asInt(body.workoutTypeId);
    if (workoutTypeId === null) return badRequest("bad workoutTypeId");
    const type = db.select().from(workoutTypes).where(eq(workoutTypes.id, workoutTypeId)).get();
    if (!type) return badRequest("unknown workout type");
    patch.workoutTypeId = type.id;
    if (!type.hasSubtypes) patch.workoutSubtypeId = null;
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
      const targetType = patch.workoutTypeId ?? existing.workoutTypeId;
      if (!subtype || subtype.workoutTypeId !== targetType) return badRequest("unknown subtype");
      patch.workoutSubtypeId = subtype.id;
    }
  }

  if (existing.calendarSyncState === "synced") patch.calendarSyncState = "pending";

  db.update(workouts).set(patch).where(eq(workouts.id, id)).run();
  return ok();
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  const existing = db.select().from(workouts).where(eq(workouts.id, id)).get();
  if (!existing) return notFound();

  db.update(workouts)
    .set({
      deletedAt: Math.floor(Date.now() / 1000),
      calendarSyncState: existing.calendarHref ? "pending" : "skipped",
    })
    .where(eq(workouts.id, id))
    .run();

  return ok();
}
