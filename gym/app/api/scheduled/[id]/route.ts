import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { scheduledWorkouts, workouts, workoutTypes } from "@/lib/db/schema";
import { asInt, asString, badRequest, notFound, ok, readJson, requireSession } from "@/lib/api";
import { confirmScheduled, dismissScheduled } from "@/lib/calendar/sync";
import { linkWorkoutToPlan } from "@/lib/planning";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const denied = await requireSession();
  if (denied) return denied;

  const id = asInt((await params).id);
  if (id === null) return badRequest("bad id");

  const scheduled = db
    .select()
    .from(scheduledWorkouts)
    .where(eq(scheduledWorkouts.id, id))
    .get();
  if (!scheduled) return notFound();

  const body = await readJson(request);
  const action = asString(body.action) ?? "confirm";

  if (action === "dismiss") {
    dismissScheduled(id);
    return ok();
  }

  if (action !== "confirm") return badRequest("action must be confirm or dismiss");
  if (scheduled.confirmedWorkoutId !== null) return badRequest("already logged");

  const workoutTypeId = asInt(body.workoutTypeId) ?? scheduled.guessedTypeId;
  if (workoutTypeId === null) return badRequest("pick a workout type");

  const type = db.select().from(workoutTypes).where(eq(workoutTypes.id, workoutTypeId)).get();
  if (!type) return badRequest("unknown workout type");

  const durationSec = Math.max(0, scheduled.endsAt - scheduled.startsAt) || null;

  const created = db
    .insert(workouts)
    .values({
      performedOn: scheduled.scheduledOn,
      workoutTypeId: type.id,
      workoutSubtypeId: asInt(body.workoutSubtypeId),
      startedAt: scheduled.startsAt,
      durationSec,
      durationSource: durationSec === null ? null : "manual",
      notes: scheduled.title,
      sourceScheduledId: scheduled.id,
      /**
       * A class read off the calendar is already on the calendar. Writing our own
       * event for it would put two entries on the same hour.
       */
      calendarSyncState: "skipped",
    })
    .returning({ id: workouts.id })
    .get();

  linkWorkoutToPlan(created.id, scheduled.scheduledOn, type.id);
  confirmScheduled(id, created.id);

  return ok({ id: created.id });
}
