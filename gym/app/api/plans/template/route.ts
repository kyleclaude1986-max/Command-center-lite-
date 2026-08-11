import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { planTemplateDays, planTemplates, workoutSubtypes, workoutTypes } from "@/lib/db/schema";
import { asInt, badRequest, ok, readJson, requireSession } from "@/lib/api";
import { materializePlans, planParamError } from "@/lib/planning";

type DayInput = {
  dayOfWeek: number;
  workoutTypeId: number | null;
  workoutSubtypeId: number | null;
  targetRepsLow: number;
  targetRepsHigh: number;
  restSeconds: number;
  exerciseCount: number;
};

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await readJson(request);
  const rawDays = Array.isArray(body.days) ? body.days : null;
  if (!rawDays) return badRequest("days is required");

  let template = db.select().from(planTemplates).where(eq(planTemplates.isActive, true)).get();
  if (!template) {
    template = db
      .insert(planTemplates)
      .values({ name: "My week", isActive: true })
      .returning()
      .get();
  }

  const types = db.select().from(workoutTypes).all();
  const subtypes = db.select().from(workoutSubtypes).all();
  const parsed: DayInput[] = [];

  for (const raw of rawDays) {
    const entry = raw as Record<string, unknown>;
    const dayOfWeek = asInt(entry.dayOfWeek);
    if (dayOfWeek === null || dayOfWeek < 1 || dayOfWeek > 7) {
      return badRequest("dayOfWeek must be 1-7");
    }

    const workoutTypeId = asInt(entry.workoutTypeId);
    if (workoutTypeId === null) {
      parsed.push({
        dayOfWeek,
        workoutTypeId: null,
        workoutSubtypeId: null,
        targetRepsLow: 8,
        targetRepsHigh: 12,
        restSeconds: 90,
        exerciseCount: 5,
      });
      continue;
    }

    const type = types.find((t) => t.id === workoutTypeId);
    if (!type) return badRequest("unknown workout type");

    let workoutSubtypeId = asInt(entry.workoutSubtypeId);
    if (workoutSubtypeId !== null) {
      const subtype = subtypes.find((s) => s.id === workoutSubtypeId);
      if (!subtype || subtype.workoutTypeId !== type.id) return badRequest("unknown subtype");
    }
    if (!type.hasSubtypes) workoutSubtypeId = null;
    if (type.hasSubtypes && workoutSubtypeId === null) {
      return badRequest(`${type.name} needs a day picked`);
    }

    const targetRepsLow = asInt(entry.targetRepsLow) ?? 8;
    const targetRepsHigh = asInt(entry.targetRepsHigh) ?? 12;
    const restSeconds = asInt(entry.restSeconds) ?? 90;
    const exerciseCount = asInt(entry.exerciseCount) ?? 5;

    const invalid = planParamError({
      targetRepsLow,
      targetRepsHigh,
      restSeconds,
      exerciseCount,
    });
    if (invalid) return badRequest(invalid);

    parsed.push({
      dayOfWeek,
      workoutTypeId: type.id,
      workoutSubtypeId,
      targetRepsLow,
      targetRepsHigh,
      restSeconds,
      exerciseCount,
    });
  }

  db.delete(planTemplateDays).where(eq(planTemplateDays.templateId, template.id)).run();
  for (const day of parsed) {
    if (day.workoutTypeId === null) continue;
    db.insert(planTemplateDays)
      .values({ templateId: template.id, ...day, workoutTypeId: day.workoutTypeId })
      .run();
  }

  const result = materializePlans();
  return ok(result);
}
