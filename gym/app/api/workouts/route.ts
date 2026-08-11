import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { recoveryLog, workouts, workoutSubtypes, workoutTypes } from "@/lib/db/schema";
import { asInt, asString, badRequest, ok, readJson, requireSession } from "@/lib/api";
import { isValidIso, todayIso } from "@/lib/dates";

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await readJson(request);
  const workoutTypeId = asInt(body.workoutTypeId);
  if (workoutTypeId === null) return badRequest("workoutTypeId is required");

  const type = db.select().from(workoutTypes).where(eq(workoutTypes.id, workoutTypeId)).get();
  if (!type) return badRequest("unknown workout type");

  const performedOn = asString(body.performedOn) ?? todayIso();
  if (!isValidIso(performedOn)) return badRequest("performedOn must be YYYY-MM-DD");

  let workoutSubtypeId = asInt(body.workoutSubtypeId);
  if (workoutSubtypeId !== null) {
    const subtype = db
      .select()
      .from(workoutSubtypes)
      .where(eq(workoutSubtypes.id, workoutSubtypeId))
      .get();
    if (!subtype || subtype.workoutTypeId !== type.id) return badRequest("unknown subtype");
  } else if (type.hasSubtypes) {
    workoutSubtypeId = null;
  }

  const durationMinutes = asInt(body.durationMinutes);
  const rating = asInt(body.rating);
  if (rating !== null && (rating < 1 || rating > 5)) return badRequest("rating must be 1-5");

  const created = db
    .insert(workouts)
    .values({
      performedOn,
      workoutTypeId: type.id,
      workoutSubtypeId,
      durationSec: durationMinutes === null ? null : durationMinutes * 60,
      durationSource: durationMinutes === null ? null : "manual",
      rating,
      notes: asString(body.notes),
      sourceScheduledId: asInt(body.sourceScheduledId),
      calendarSyncState: asInt(body.sourceScheduledId) === null ? "pending" : "skipped",
    })
    .returning({ id: workouts.id })
    .get();

  const recoveryTypeIds = Array.isArray(body.recoveryTypeIds) ? body.recoveryTypeIds : [];
  for (const raw of recoveryTypeIds) {
    const recoveryTypeId = asInt(raw);
    if (recoveryTypeId === null) continue;
    db.insert(recoveryLog)
      .values({ performedOn, recoveryTypeId, workoutId: created.id })
      .onConflictDoUpdate({
        target: [recoveryLog.performedOn, recoveryLog.recoveryTypeId],
        set: { workoutId: created.id },
      })
      .run();
  }

  return ok({ id: created.id });
}
