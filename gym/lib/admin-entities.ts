import { count, eq } from "drizzle-orm";
import { db } from "./db/client";
import {
  exercises,
  goals,
  gymSettings,
  MUSCLE_GROUPS,
  recoveryLog,
  recoveryTypes,
  vacations,
  workoutExercises,
  workouts,
  workoutSubtypes,
  workoutTypes,
} from "./db/schema";
import type { MuscleGroup } from "./db/schema";
import { asBool, asInt, asString } from "./api";
import { isValidIso } from "./dates";
import { slugify } from "./slug";
import { swatchOr } from "./swatches";

export type EntityResult = { error: string } | { ok: true; id?: number };

type Handler = {
  create?: (body: Record<string, unknown>) => EntityResult;
  update?: (id: number, body: Record<string, unknown>) => EntityResult;
  archive?: (id: number, on: boolean) => EntityResult;
  destroy?: (id: number) => EntityResult;
};

const nowSec = () => Math.floor(Date.now() / 1000);

function uniqueSlug(base: string, exists: (slug: string) => boolean): string {
  const root = slugify(base) || "item";
  if (!exists(root)) return root;
  for (let i = 2; i < 200; i += 1) {
    const candidate = `${root}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

function restrictedDelete(label: string, used: number): EntityResult {
  return {
    error: `Still used by ${used} ${label}. Archive it instead so the history stays readable.`,
  };
}

export function countWorkoutsForType(workoutTypeId: number): number {
  return (
    db
      .select({ n: count() })
      .from(workouts)
      .where(eq(workouts.workoutTypeId, workoutTypeId))
      .get()?.n ?? 0
  );
}

export function countRecoveryForType(recoveryTypeId: number): number {
  return (
    db
      .select({ n: count() })
      .from(recoveryLog)
      .where(eq(recoveryLog.recoveryTypeId, recoveryTypeId))
      .get()?.n ?? 0
  );
}

export function countWorkoutsForExercise(exerciseId: number): number {
  return (
    db
      .select({ n: count() })
      .from(workoutExercises)
      .where(eq(workoutExercises.exerciseId, exerciseId))
      .get()?.n ?? 0
  );
}

export function countTypesForGoal(goalId: number): number {
  const types =
    db.select({ n: count() }).from(workoutTypes).where(eq(workoutTypes.goalId, goalId)).get()?.n ??
    0;
  const recovery =
    db.select({ n: count() }).from(recoveryTypes).where(eq(recoveryTypes.goalId, goalId)).get()
      ?.n ?? 0;
  return types + recovery;
}

export const ADMIN_ENTITIES: Record<string, Handler> = {
  goals: {
    create(body) {
      const name = asString(body.name);
      if (!name) return { error: "Name is required." };
      const target = asInt(body.targetDaysPerWeek);
      if (target === null || target < 0 || target > 7) {
        return { error: "Target must be between 0 and 7 days." };
      }
      const minMinutes = asInt(body.minDurationMinutes);
      const slug = uniqueSlug(
        name,
        (s) => db.select().from(goals).where(eq(goals.slug, s)).get() !== undefined
      );
      const row = db
        .insert(goals)
        .values({
          slug,
          name,
          targetDaysPerWeek: target,
          minDurationSec: minMinutes === null || minMinutes <= 0 ? null : minMinutes * 60,
          position: asInt(body.position) ?? 0,
        })
        .returning({ id: goals.id })
        .get();
      return { ok: true, id: row.id };
    },
    update(id, body) {
      const patch: Partial<typeof goals.$inferInsert> = {};
      if ("name" in body) {
        const name = asString(body.name);
        if (!name) return { error: "Name is required." };
        patch.name = name;
      }
      if ("targetDaysPerWeek" in body) {
        const target = asInt(body.targetDaysPerWeek);
        if (target === null || target < 0 || target > 7) {
          return { error: "Target must be between 0 and 7 days." };
        }
        patch.targetDaysPerWeek = target;
      }
      if ("minDurationMinutes" in body) {
        const minutes = asInt(body.minDurationMinutes);
        patch.minDurationSec = minutes === null || minutes <= 0 ? null : minutes * 60;
      }
      if ("position" in body) patch.position = asInt(body.position) ?? 0;
      db.update(goals).set(patch).where(eq(goals.id, id)).run();
      return { ok: true };
    },
    archive(id, on) {
      db.update(goals)
        .set({ archivedAt: on ? nowSec() : null })
        .where(eq(goals.id, id))
        .run();
      return { ok: true };
    },
    destroy(id) {
      db.delete(goals).where(eq(goals.id, id)).run();
      return { ok: true };
    },
  },

  "workout-types": {
    create(body) {
      const name = asString(body.name);
      if (!name) return { error: "Name is required." };
      const slug = uniqueSlug(
        name,
        (s) => db.select().from(workoutTypes).where(eq(workoutTypes.slug, s)).get() !== undefined
      );
      const row = db
        .insert(workoutTypes)
        .values({
          slug,
          name,
          goalId: asInt(body.goalId),
          hasSubtypes: asBool(body.hasSubtypes),
          color: swatchOr(asString(body.color)),
          position: asInt(body.position) ?? 0,
        })
        .returning({ id: workoutTypes.id })
        .get();
      return { ok: true, id: row.id };
    },
    update(id, body) {
      const patch: Partial<typeof workoutTypes.$inferInsert> = {};
      if ("name" in body) {
        const name = asString(body.name);
        if (!name) return { error: "Name is required." };
        patch.name = name;
      }
      if ("goalId" in body) patch.goalId = asInt(body.goalId);
      if ("hasSubtypes" in body) patch.hasSubtypes = asBool(body.hasSubtypes);
      if ("color" in body) patch.color = swatchOr(asString(body.color));
      if ("position" in body) patch.position = asInt(body.position) ?? 0;
      db.update(workoutTypes).set(patch).where(eq(workoutTypes.id, id)).run();
      return { ok: true };
    },
    archive(id, on) {
      db.update(workoutTypes)
        .set({ archivedAt: on ? nowSec() : null })
        .where(eq(workoutTypes.id, id))
        .run();
      return { ok: true };
    },
    destroy(id) {
      const used = countWorkoutsForType(id);
      if (used > 0) return restrictedDelete("logged workouts", used);
      db.delete(workoutTypes).where(eq(workoutTypes.id, id)).run();
      return { ok: true };
    },
  },

  "workout-subtypes": {
    create(body) {
      const name = asString(body.name);
      const workoutTypeId = asInt(body.workoutTypeId);
      if (!name) return { error: "Name is required." };
      if (workoutTypeId === null) return { error: "Pick a workout type." };
      const existing = db
        .select()
        .from(workoutSubtypes)
        .where(eq(workoutSubtypes.workoutTypeId, workoutTypeId))
        .all();
      const slug = uniqueSlug(name, (s) => existing.some((row) => row.slug === s));
      const row = db
        .insert(workoutSubtypes)
        .values({ workoutTypeId, slug, name, position: asInt(body.position) ?? existing.length })
        .returning({ id: workoutSubtypes.id })
        .get();
      return { ok: true, id: row.id };
    },
    update(id, body) {
      const patch: Partial<typeof workoutSubtypes.$inferInsert> = {};
      if ("name" in body) {
        const name = asString(body.name);
        if (!name) return { error: "Name is required." };
        patch.name = name;
      }
      if ("position" in body) patch.position = asInt(body.position) ?? 0;
      db.update(workoutSubtypes).set(patch).where(eq(workoutSubtypes.id, id)).run();
      return { ok: true };
    },
    archive(id, on) {
      db.update(workoutSubtypes)
        .set({ archivedAt: on ? nowSec() : null })
        .where(eq(workoutSubtypes.id, id))
        .run();
      return { ok: true };
    },
    destroy(id) {
      db.delete(workoutSubtypes).where(eq(workoutSubtypes.id, id)).run();
      return { ok: true };
    },
  },

  "recovery-types": {
    create(body) {
      const name = asString(body.name);
      if (!name) return { error: "Name is required." };
      const slug = uniqueSlug(
        name,
        (s) => db.select().from(recoveryTypes).where(eq(recoveryTypes.slug, s)).get() !== undefined
      );
      const row = db
        .insert(recoveryTypes)
        .values({
          slug,
          name,
          goalId: asInt(body.goalId),
          color: swatchOr(asString(body.color)),
          position: asInt(body.position) ?? 0,
        })
        .returning({ id: recoveryTypes.id })
        .get();
      return { ok: true, id: row.id };
    },
    update(id, body) {
      const patch: Partial<typeof recoveryTypes.$inferInsert> = {};
      if ("name" in body) {
        const name = asString(body.name);
        if (!name) return { error: "Name is required." };
        patch.name = name;
      }
      if ("goalId" in body) patch.goalId = asInt(body.goalId);
      if ("color" in body) patch.color = swatchOr(asString(body.color));
      if ("position" in body) patch.position = asInt(body.position) ?? 0;
      db.update(recoveryTypes).set(patch).where(eq(recoveryTypes.id, id)).run();
      return { ok: true };
    },
    archive(id, on) {
      db.update(recoveryTypes)
        .set({ archivedAt: on ? nowSec() : null })
        .where(eq(recoveryTypes.id, id))
        .run();
      return { ok: true };
    },
    destroy(id) {
      const used = countRecoveryForType(id);
      if (used > 0) return restrictedDelete("logged recovery days", used);
      db.delete(recoveryTypes).where(eq(recoveryTypes.id, id)).run();
      return { ok: true };
    },
  },

  vacations: {
    create(body) {
      const startsOn = asString(body.startsOn);
      const endsOn = asString(body.endsOn);
      if (!startsOn || !isValidIso(startsOn)) return { error: "Start date must be YYYY-MM-DD." };
      if (!endsOn || !isValidIso(endsOn)) return { error: "End date must be YYYY-MM-DD." };
      if (endsOn < startsOn) return { error: "End date cannot be before the start date." };
      const row = db
        .insert(vacations)
        .values({ startsOn, endsOn, label: asString(body.label) })
        .returning({ id: vacations.id })
        .get();
      return { ok: true, id: row.id };
    },
    update(id, body) {
      const existing = db.select().from(vacations).where(eq(vacations.id, id)).get();
      if (!existing) return { error: "Not found." };
      const startsOn = "startsOn" in body ? asString(body.startsOn) : existing.startsOn;
      const endsOn = "endsOn" in body ? asString(body.endsOn) : existing.endsOn;
      if (!startsOn || !isValidIso(startsOn)) return { error: "Start date must be YYYY-MM-DD." };
      if (!endsOn || !isValidIso(endsOn)) return { error: "End date must be YYYY-MM-DD." };
      if (endsOn < startsOn) return { error: "End date cannot be before the start date." };
      db.update(vacations)
        .set({ startsOn, endsOn, label: "label" in body ? asString(body.label) : existing.label })
        .where(eq(vacations.id, id))
        .run();
      return { ok: true };
    },
    destroy(id) {
      db.delete(vacations).where(eq(vacations.id, id)).run();
      return { ok: true };
    },
  },

  exercises: {
    create(body) {
      const name = asString(body.name);
      if (!name) return { error: "Name is required." };
      const group = asString(body.muscleGroup) as MuscleGroup | null;
      if (!group || !MUSCLE_GROUPS.includes(group)) return { error: "Pick a muscle group." };
      const slug = uniqueSlug(
        name,
        (s) => db.select().from(exercises).where(eq(exercises.slug, s)).get() !== undefined
      );
      const row = db
        .insert(exercises)
        .values({ slug, name, muscleGroup: group, isCustom: true })
        .returning({ id: exercises.id })
        .get();
      return { ok: true, id: row.id };
    },
    update(id, body) {
      const patch: Partial<typeof exercises.$inferInsert> = {};
      if ("name" in body) {
        const name = asString(body.name);
        if (!name) return { error: "Name is required." };
        patch.name = name;
      }
      if ("muscleGroup" in body) {
        const group = asString(body.muscleGroup) as MuscleGroup | null;
        if (!group || !MUSCLE_GROUPS.includes(group)) return { error: "Pick a muscle group." };
        patch.muscleGroup = group;
      }
      db.update(exercises).set(patch).where(eq(exercises.id, id)).run();
      return { ok: true };
    },
    archive(id, on) {
      db.update(exercises)
        .set({ archivedAt: on ? nowSec() : null })
        .where(eq(exercises.id, id))
        .run();
      return { ok: true };
    },
    destroy(id) {
      const used = countWorkoutsForExercise(id);
      if (used > 0) return restrictedDelete("logged workouts", used);
      db.delete(exercises).where(eq(exercises.id, id)).run();
      return { ok: true };
    },
  },

  settings: {
    update(_id, body) {
      const existing = db.select().from(gymSettings).limit(1).get();
      const patch: Partial<typeof gymSettings.$inferInsert> = { updatedAt: nowSec() };
      if ("timezone" in body) {
        const timezone = asString(body.timezone);
        if (!timezone) return { error: "Timezone is required." };
        patch.timezone = timezone;
      }
      if ("scannedCalendars" in body) {
        const list = Array.isArray(body.scannedCalendars) ? body.scannedCalendars : [];
        patch.scannedCalendars = JSON.stringify(list.filter((x) => typeof x === "string"));
      }
      if (!existing) {
        db.insert(gymSettings).values(patch).run();
        return { ok: true };
      }
      db.update(gymSettings).set(patch).where(eq(gymSettings.id, existing.id)).run();
      return { ok: true };
    },
  },
};

export function isKnownEntity(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ADMIN_ENTITIES, name);
}
