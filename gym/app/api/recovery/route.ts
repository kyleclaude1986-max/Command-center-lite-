import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { recoveryLog, recoveryTypes } from "@/lib/db/schema";
import { asBool, asInt, asString, badRequest, ok, readJson, requireSession } from "@/lib/api";
import { isValidIso, todayIso } from "@/lib/dates";

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await readJson(request);
  const recoveryTypeId = asInt(body.recoveryTypeId);
  if (recoveryTypeId === null) return badRequest("recoveryTypeId is required");

  const type = db.select().from(recoveryTypes).where(eq(recoveryTypes.id, recoveryTypeId)).get();
  if (!type) return badRequest("unknown recovery type");

  const performedOn = asString(body.performedOn) ?? todayIso();
  if (!isValidIso(performedOn)) return badRequest("performedOn must be YYYY-MM-DD");

  const on = "on" in body ? asBool(body.on) : null;
  const existing = db
    .select()
    .from(recoveryLog)
    .where(
      and(eq(recoveryLog.performedOn, performedOn), eq(recoveryLog.recoveryTypeId, recoveryTypeId))
    )
    .get();

  const shouldBeOn = on === null ? !existing : on;

  if (shouldBeOn && !existing) {
    db.insert(recoveryLog)
      .values({ performedOn, recoveryTypeId, workoutId: asInt(body.workoutId) })
      .run();
  } else if (!shouldBeOn && existing) {
    db.delete(recoveryLog).where(eq(recoveryLog.id, existing.id)).run();
  }

  return ok({ on: shouldBeOn });
}
