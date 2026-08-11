import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { supplementLog, supplements } from "@/lib/db/schema";
import { asBool, asInt, asString, badRequest, ok, readJson, requireSession } from "@/lib/api";
import { isValidIso, todayIso } from "@/lib/dates";
import { slotGroupsFor } from "@/lib/supplements";

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await readJson(request);
  const takenOn = asString(body.takenOn) ?? todayIso();
  if (!isValidIso(takenOn)) return badRequest("takenOn must be YYYY-MM-DD");

  const slotId = asInt(body.slotId);
  const supplementId = asInt(body.supplementId);
  if (slotId === null && supplementId === null) {
    return badRequest("supplementId or slotId is required");
  }

  const targetIds =
    supplementId !== null
      ? [supplementId]
      : slotGroupsFor(takenOn)
          .filter((group) => group.slot.id === slotId)
          .flatMap((group) => group.items.map((item) => item.supplement.id));

  if (targetIds.length === 0) return ok({ changed: 0 });

  const known = db
    .select({ id: supplements.id })
    .from(supplements)
    .where(inArray(supplements.id, targetIds))
    .all()
    .map((row) => row.id);
  if (known.length === 0) return badRequest("unknown supplement");

  const existing = db
    .select()
    .from(supplementLog)
    .where(
      and(eq(supplementLog.takenOn, takenOn), inArray(supplementLog.supplementId, known))
    )
    .all();
  const loggedIds = new Set(existing.map((row) => row.supplementId));

  const on = "on" in body ? asBool(body.on) : known.some((id) => !loggedIds.has(id));

  let changed = 0;
  for (const id of known) {
    if (on && !loggedIds.has(id)) {
      db.insert(supplementLog).values({ takenOn, supplementId: id }).run();
      changed += 1;
    } else if (!on && loggedIds.has(id)) {
      db.delete(supplementLog)
        .where(and(eq(supplementLog.takenOn, takenOn), eq(supplementLog.supplementId, id)))
        .run();
      changed += 1;
    }
  }

  return ok({ on, changed });
}
