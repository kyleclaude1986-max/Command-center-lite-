import { eq } from "drizzle-orm";
import { db } from "./db/client";
import {
  exercises,
  goals,
  gymSettings,
  macroTargets,
  recoveryTypes,
  workoutSubtypes,
  workoutTypes,
} from "./db/schema";
import {
  SEED_DEFAULT_MACRO_TARGET,
  SEED_EXERCISES,
  SEED_GOALS,
  SEED_RECOVERY_TYPES,
  SEED_WORKOUT_TYPES,
} from "./seed-data";
import { slugify } from "./slug";

function ensureSettings(): number {
  const existing = db.select().from(gymSettings).limit(1).all();
  if (existing.length > 0) return 0;
  db.insert(gymSettings).values({}).run();
  return 1;
}

function ensureGoals(): { created: number; ids: Map<string, number> } {
  const ids = new Map<string, number>();
  let created = 0;
  for (const goal of SEED_GOALS) {
    const found = db.select().from(goals).where(eq(goals.slug, goal.slug)).get();
    if (found) {
      ids.set(goal.slug, found.id);
      continue;
    }
    const row = db.insert(goals).values(goal).returning({ id: goals.id }).get();
    ids.set(goal.slug, row.id);
    created += 1;
  }
  return { created, ids };
}

function ensureWorkoutTypes(goalIds: Map<string, number>): number {
  let created = 0;
  for (const type of SEED_WORKOUT_TYPES) {
    let found = db.select().from(workoutTypes).where(eq(workoutTypes.slug, type.slug)).get();
    if (!found) {
      found = db
        .insert(workoutTypes)
        .values({
          slug: type.slug,
          name: type.name,
          goalId: type.goalSlug ? (goalIds.get(type.goalSlug) ?? null) : null,
          hasSubtypes: type.subtypes.length > 0,
          color: type.color,
          position: type.position,
        })
        .returning()
        .get();
      created += 1;
    }

    const existing = db
      .select()
      .from(workoutSubtypes)
      .where(eq(workoutSubtypes.workoutTypeId, found.id))
      .all();

    for (const [index, name] of type.subtypes.entries()) {
      const slug = slugify(name);
      if (existing.some((s) => s.slug === slug)) continue;
      db.insert(workoutSubtypes)
        .values({ workoutTypeId: found.id, slug, name, position: index })
        .run();
      created += 1;
    }
  }
  return created;
}

function ensureRecoveryTypes(): number {
  let created = 0;
  for (const type of SEED_RECOVERY_TYPES) {
    const found = db.select().from(recoveryTypes).where(eq(recoveryTypes.slug, type.slug)).get();
    if (found) continue;
    db.insert(recoveryTypes).values(type).run();
    created += 1;
  }
  return created;
}

function ensureExercises(): number {
  let created = 0;
  for (const { group, names } of SEED_EXERCISES) {
    for (const name of names) {
      const slug = slugify(name);
      const found = db.select().from(exercises).where(eq(exercises.slug, slug)).get();
      if (found) continue;
      db.insert(exercises).values({ slug, name, muscleGroup: group }).run();
      created += 1;
    }
  }
  return created;
}

function ensureDefaultMacroTarget(): number {
  const found = db.select().from(macroTargets).where(eq(macroTargets.scopeKey, 0)).get();
  if (found) return 0;
  db.insert(macroTargets)
    .values({ workoutTypeId: null, scopeKey: 0, ...SEED_DEFAULT_MACRO_TARGET })
    .run();
  return 1;
}

export function runSeed(): number {
  let created = ensureSettings();
  const { created: goalsCreated, ids } = ensureGoals();
  created += goalsCreated;
  created += ensureWorkoutTypes(ids);
  created += ensureRecoveryTypes();
  created += ensureExercises();
  created += ensureDefaultMacroTarget();
  return created;
}
