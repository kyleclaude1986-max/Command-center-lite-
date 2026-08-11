import { rmSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = resolve(process.env.SQLITE_PATH ?? "./data/verify.sqlite");
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${dbPath}${suffix}`, { force: true });
}

const { db } = require("../lib/db/client") as typeof import("../lib/db/client");
const { migrate } =
  require("drizzle-orm/better-sqlite3/migrator") as typeof import("drizzle-orm/better-sqlite3/migrator");
const { runSeed } = require("../lib/seed") as typeof import("../lib/seed");
const schema = require("../lib/db/schema") as typeof import("../lib/db/schema");
const goalsLib = require("../lib/goals") as typeof import("../lib/goals");
const dates = require("../lib/dates") as typeof import("../lib/dates");
const { eq } = require("drizzle-orm") as typeof import("drizzle-orm");

migrate(db, { migrationsFolder: "./drizzle" });
runSeed();

const supplementsLib = require("../lib/supplements") as typeof import("../lib/supplements");
const planning = require("../lib/planning") as typeof import("../lib/planning");
const logbook = require("../lib/logbook") as typeof import("../lib/logbook");
const body = require("../lib/body") as typeof import("../lib/body");
const generator = require("../lib/ai/workout-generator") as typeof import("../lib/ai/workout-generator");
const format = require("../lib/format") as typeof import("../lib/format");

const {
  exercises,
  exerciseSets,
  goals,
  planExercises,
  planSets,
  planTemplateDays,
  planTemplates,
  recoveryLog,
  recoveryTypes,
  supplementLog,
  supplements,
  supplementSlots,
  vacations,
  workoutPlans,
  workouts,
  workoutSubtypes,
  workoutTypes,
} = schema;
const { addDaysIso, diffDaysIso, weekStartIso } = dates;

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown) {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

const TODAY = "2026-08-12";
const WEEK = weekStartIso(TODAY);
const ELAPSED = diffDaysIso(WEEK, TODAY);

function typeId(slug: string): number {
  const row = db.select().from(workoutTypes).where(eq(workoutTypes.slug, slug)).get();
  if (!row) throw new Error(`missing workout type ${slug}`);
  return row.id;
}

function goalBySlug(slug: string) {
  const row = db.select().from(goals).where(eq(goals.slug, slug)).get();
  if (!row) throw new Error(`missing goal ${slug}`);
  return row;
}

function logWorkout(slug: string, performedOn: string, durationMinutes?: number) {
  db.insert(workouts)
    .values({
      performedOn,
      workoutTypeId: typeId(slug),
      durationSec: durationMinutes === undefined ? null : durationMinutes * 60,
      durationSource: durationMinutes === undefined ? null : "manual",
    })
    .run();
}

function reset() {
  db.delete(recoveryLog).run();
  db.delete(workouts).run();
  db.delete(vacations).run();
}

function summary(slug: string) {
  return goalsLib.goalSummary(goalBySlug(slug), TODAY);
}

section(`Fixed today ${TODAY}, week starts ${WEEK}, ${ELAPSED + 1} days elapsed`);

section("Goal separation");
reset();
logWorkout("ithinkfit-gym-fit-camp", WEEK);
logWorkout("ithinkfit-olympius", addDaysIso(WEEK, 1));
logWorkout("west-o-strength", addDaysIso(WEEK, 2));
check("gym counts three gym workouts", summary("gym").qualifiedCount, 3);
check("cardio unaffected by gym workouts", summary("cardio").qualifiedCount, 0);

reset();
logWorkout("walking", WEEK, 40);
logWorkout("running-weighted-vest", addDaysIso(WEEK, 1), 40);
check("cardio counts both walk types", summary("cardio").qualifiedCount, 2);
check("gym unaffected by cardio workouts", summary("gym").qualifiedCount, 0);

reset();
logWorkout("apple-health-import", WEEK, 60);
check("apple health import does not count toward gym", summary("gym").qualifiedCount, 0);
check("apple health import does not count toward cardio", summary("cardio").qualifiedCount, 0);

section("Cardio minimum duration");
reset();
logWorkout("walking-weighted-vest", WEEK, 20);
check("20 minute vest walk does not count", summary("cardio").qualifiedCount, 0);

reset();
logWorkout("walking-weighted-vest", WEEK, 30);
check("30 minute vest walk counts", summary("cardio").qualifiedCount, 1);

reset();
logWorkout("walking-weighted-vest", WEEK);
check("vest walk with no duration does not count", summary("cardio").qualifiedCount, 0);

reset();
logWorkout("walking-weighted-vest", WEEK, 20);
db.update(goals).set({ minDurationSec: 900 }).where(eq(goals.slug, "cardio")).run();
check("lowering the minimum to 15 counts the 20 minute walk", summary("cardio").qualifiedCount, 1);
db.update(goals).set({ minDurationSec: 1500 }).where(eq(goals.slug, "cardio")).run();
check("restoring the minimum uncounts it", summary("cardio").qualifiedCount, 0);

section("Vacation pro-rating");
reset();
check("gym target with no vacation", summary("gym").adjustedTarget, 5);
db.insert(vacations).values({ startsOn: WEEK, endsOn: addDaysIso(WEEK, 2) }).run();
check("three vacation days lower gym target to three", summary("gym").adjustedTarget, 3);
check("three vacation days leave cardio target at one", summary("cardio").adjustedTarget, 1);
check("vacation days counted", summary("gym").vacationDays, 3);

reset();
db.insert(vacations).values({ startsOn: WEEK, endsOn: addDaysIso(WEEK, 6) }).run();
check("a full vacation week floors the gym target at zero", summary("gym").adjustedTarget, 0);
check("a full vacation week floors the cardio target at zero", summary("cardio").adjustedTarget, 0);
check("a zero target counts as met", summary("gym").met, true);

reset();
db.insert(vacations).values({ startsOn: WEEK, endsOn: addDaysIso(WEEK, 2) }).run();
for (let i = 0; i <= Math.min(2, ELAPSED); i += 1) logWorkout("west-o-strength", addDaysIso(WEEK, i));
check("hitting the reduced target counts as met", summary("gym").met, true);
check("original target still reported", summary("gym").target, 5);

section("Streaks");
reset();
for (const weeksBack of [1, 2]) {
  const start = addDaysIso(WEEK, -7 * weeksBack);
  for (let i = 0; i < 5; i += 1) logWorkout("west-o-strength", addDaysIso(start, i));
}
check("two full prior weeks give a streak of two", summary("gym").streakWeeks, 2);
check("current partial week is not met", summary("gym").met, false);
check("current week count is zero", summary("gym").qualifiedCount, 0);

logWorkout("west-o-strength", WEEK);
check("one gym day this week does not yet extend the streak", summary("gym").streakWeeks, 2);

for (let i = 1; i < 5; i += 1) logWorkout("west-o-strength", addDaysIso(WEEK, i));
check("five gym days this week meets the goal", summary("gym").met, true);
check("meeting this week extends the streak to three", summary("gym").streakWeeks, 3);

reset();
for (const weeksBack of [1, 3]) {
  const start = addDaysIso(WEEK, -7 * weeksBack);
  for (let i = 0; i < 5; i += 1) logWorkout("west-o-strength", addDaysIso(start, i));
}
check("a missed week breaks the streak", summary("gym").streakWeeks, 1);

section("Recovery");
reset();
const sauna = db.select().from(recoveryTypes).where(eq(recoveryTypes.slug, "sauna")).get()!;
db.insert(recoveryLog).values({ performedOn: WEEK, recoveryTypeId: sauna.id }).run();
check("recovery with no goal counts toward nothing", summary("gym").qualifiedCount, 0);

const saunaGoal = db
  .insert(goals)
  .values({ slug: "sauna-goal", name: "Sauna", targetDaysPerWeek: 3, position: 2 })
  .returning()
  .get();
db.update(recoveryTypes).set({ goalId: saunaGoal.id }).where(eq(recoveryTypes.id, sauna.id)).run();
check("recovery with a goal counts", summary("sauna-goal").qualifiedCount, 1);
check("recovery goal target respected", summary("sauna-goal").adjustedTarget, 3);
check("recovery goal not yet met", summary("sauna-goal").met, false);

for (let i = 1; i <= Math.min(2, ELAPSED); i += 1) {
  db.insert(recoveryLog)
    .values({ performedOn: addDaysIso(WEEK, i), recoveryTypeId: sauna.id })
    .run();
}
check("three sauna days meet the recovery goal", summary("sauna-goal").met, true);

section("Archiving keeps history");
reset();
logWorkout("ithinkfit-olympius", WEEK);
check("logged before archiving", summary("gym").qualifiedCount, 1);
db.update(workoutTypes)
  .set({ archivedAt: Math.floor(Date.now() / 1000) })
  .where(eq(workoutTypes.slug, "ithinkfit-olympius"))
  .run();
check("archived type still counts its history", summary("gym").qualifiedCount, 1);

section("Soft delete");
reset();
logWorkout("west-o-strength", WEEK);
check("logged", summary("gym").qualifiedCount, 1);
db.update(workouts).set({ deletedAt: Math.floor(Date.now() / 1000) }).run();
check("soft deleted workout stops counting", summary("gym").qualifiedCount, 0);

section("Supplement schedules");
reset();
db.delete(supplementLog).run();
db.delete(supplements).run();

const morningSlot = db
  .select()
  .from(supplementSlots)
  .where(eq(supplementSlots.slug, "morning"))
  .get()!;

function addSupplement(
  slug: string,
  values: Partial<typeof supplements.$inferInsert> = {}
): number {
  return db
    .insert(supplements)
    .values({ slug, name: slug, slotId: morningSlot.id, ...values })
    .returning({ id: supplements.id })
    .get().id;
}

function dueSlugs(iso: string): string[] {
  return supplementsLib
    .supplementDay(iso, TODAY)
    .due.map((s) => s.slug)
    .sort();
}

const daily = addSupplement("daily-item");
const monWed = addSupplement("mon-wed", {
  scheduleKind: "weekdays",
  scheduleDays: JSON.stringify([1, 3]),
});
addSupplement("workout-only", { scheduleKind: "workout_days" });
addSupplement("every-third", {
  scheduleKind: "interval",
  intervalDays: 3,
  startsOn: WEEK,
});

check("daily is due on a Monday", dueSlugs(WEEK).includes("daily-item"), true);
check("daily is due on a Tuesday", dueSlugs(addDaysIso(WEEK, 1)).includes("daily-item"), true);
check("weekday item due on its Monday", dueSlugs(WEEK).includes("mon-wed"), true);
check("weekday item not due on Tuesday", dueSlugs(addDaysIso(WEEK, 1)).includes("mon-wed"), false);
check("weekday item due again on Wednesday", dueSlugs(addDaysIso(WEEK, 2)).includes("mon-wed"), true);
check("interval item due on its anchor", dueSlugs(WEEK).includes("every-third"), true);
check("interval item not due one day later", dueSlugs(addDaysIso(WEEK, 1)).includes("every-third"), false);
check("interval item due three days later", dueSlugs(addDaysIso(WEEK, 3)).includes("every-third"), true);

check("workout-day item not due with no workout", dueSlugs(WEEK).includes("workout-only"), false);
logWorkout("west-o-strength", WEEK);
check("workout-day item due once a workout is logged", dueSlugs(WEEK).includes("workout-only"), true);

section("Supplement day status and streak");
reset();
db.delete(supplementLog).run();
db.delete(supplements).run();
const a = addSupplement("item-a");
const b = addSupplement("item-b");

function take(id: number, iso: string) {
  db.insert(supplementLog).values({ takenOn: iso, supplementId: id }).run();
}

const yesterday = addDaysIso(TODAY, -1);
const twoBack = addDaysIso(TODAY, -2);

check("a past day with nothing logged reads not_logged", supplementsLib.supplementDay(yesterday, TODAY).status, "not_logged");
take(a, yesterday);
check("a past day with one of two reads missed", supplementsLib.supplementDay(yesterday, TODAY).status, "missed");
take(b, yesterday);
check("a past day with both reads hit", supplementsLib.supplementDay(yesterday, TODAY).status, "hit");

take(a, TODAY);
check("today with one outstanding reads in_progress", supplementsLib.supplementDay(TODAY, TODAY).status, "in_progress");
check("in-progress today does not break the streak", supplementsLib.supplementStreak(TODAY), 1);

take(b, TODAY);
check("completing today reads hit", supplementsLib.supplementDay(TODAY, TODAY).status, "hit");
check("completing today extends the streak", supplementsLib.supplementStreak(TODAY), 2);

take(a, twoBack);
take(b, twoBack);
check("a third consecutive day extends the streak", supplementsLib.supplementStreak(TODAY), 3);

db.delete(supplementLog).where(eq(supplementLog.takenOn, yesterday)).run();
check("a gap breaks the streak back to today only", supplementsLib.supplementStreak(TODAY), 1);

section("Archiving a supplement");
reset();
db.delete(supplementLog).run();
db.delete(supplements).run();
const solo = addSupplement("solo-item");
take(solo, yesterday);
check("due before archiving", supplementsLib.supplementDay(yesterday, TODAY).due.length, 1);
db.update(supplements)
  .set({ archivedAt: Math.floor(Date.now() / 1000) })
  .where(eq(supplements.id, solo))
  .run();
check("archived supplement stops being due", supplementsLib.supplementDay(yesterday, TODAY).due.length, 0);
check(
  "archived supplement keeps its log rows",
  db.select().from(supplementLog).all().length,
  1
);

section("Strength and planning flags");
check(
  "Olympius is spelled correctly",
  db.select().from(workoutTypes).where(eq(workoutTypes.slug, "ithinkfit-olympius")).get()?.name,
  "iThinkFit Olympius"
);
check(
  "all three gym types are strength",
  db
    .select()
    .from(workoutTypes)
    .all()
    .filter((t: { isStrength: boolean }) => t.isStrength)
    .map((t: { slug: string }) => t.slug)
    .sort(),
  ["ithinkfit-gym-fit-camp", "ithinkfit-olympius", "west-o-strength"]
);
check(
  "only West O supports planning",
  db
    .select()
    .from(workoutTypes)
    .all()
    .filter((t: { supportsPlanning: boolean }) => t.supportsPlanning)
    .map((t: { slug: string }) => t.slug),
  ["west-o-strength"]
);

section("Plan materialization");
reset();
db.delete(workoutPlans).run();
db.delete(planTemplateDays).run();

const template = db.select().from(planTemplates).get()!;
const westO = db.select().from(workoutTypes).where(eq(workoutTypes.slug, "west-o-strength")).get()!;
const subtypes = db
  .select()
  .from(workoutSubtypes)
  .where(eq(workoutSubtypes.workoutTypeId, westO.id))
  .all();
const backDay = subtypes.find((s: { slug: string }) => s.slug === "back")!;
const legsDay = subtypes.find((s: { slug: string }) => s.slug === "legs")!;
const chestDay = subtypes.find((s: { slug: string }) => s.slug === "chest")!;

function templateDay(dayOfWeek: number, subtypeId: number, exerciseCount = 5) {
  db.insert(planTemplateDays)
    .values({
      templateId: template.id,
      dayOfWeek,
      workoutTypeId: westO.id,
      workoutSubtypeId: subtypeId,
      targetRepsLow: 8,
      targetRepsHigh: 12,
      restSeconds: 90,
      exerciseCount,
    })
    .run();
}

templateDay(1, backDay.id);
templateDay(3, legsDay.id);

const first = planning.materializePlans(WEEK, 4);
check("four weeks of a two-day template creates eight plans", first.created, 8);
check("nothing to update on a fresh fill", first.updated, 0);

const second = planning.materializePlans(WEEK, 4);
check("re-running creates nothing new", second.created, 0);
check("re-running updates nothing", second.updated, 0);

const mondayPlan = db
  .select()
  .from(workoutPlans)
  .where(eq(workoutPlans.plannedOn, WEEK))
  .get()!;
check("Monday maps to the back day", mondayPlan.workoutSubtypeId, backDay.id);
const wednesdayPlan = db
  .select()
  .from(workoutPlans)
  .where(eq(workoutPlans.plannedOn, addDaysIso(WEEK, 2)))
  .get()!;
check("Wednesday maps to the leg day", wednesdayPlan.workoutSubtypeId, legsDay.id);
check(
  "Tuesday has no plan",
  db.select().from(workoutPlans).where(eq(workoutPlans.plannedOn, addDaysIso(WEEK, 1))).get(),
  undefined
);

db.update(planTemplateDays)
  .set({ exerciseCount: 7 })
  .where(eq(planTemplateDays.dayOfWeek, 1))
  .run();
const third = planning.materializePlans(WEEK, 4);
check("a template change updates untouched plans", third.updated, 4);
check(
  "the change reached the plan",
  db.select().from(workoutPlans).where(eq(workoutPlans.plannedOn, WEEK)).get()?.exerciseCount,
  7
);

db.update(workoutPlans)
  .set({ isOverride: true, exerciseCount: 3 })
  .where(eq(workoutPlans.id, mondayPlan.id))
  .run();
db.update(planTemplateDays)
  .set({ exerciseCount: 9 })
  .where(eq(planTemplateDays.dayOfWeek, 1))
  .run();
planning.materializePlans(WEEK, 4);
check(
  "an overridden day survives re-materialising",
  db.select().from(workoutPlans).where(eq(workoutPlans.id, mondayPlan.id)).get()?.exerciseCount,
  3
);

section("Deterministic fallback generator");
db.delete(planExercises).run();
const planForFallback = db
  .select()
  .from(workoutPlans)
  .where(eq(workoutPlans.id, wednesdayPlan.id))
  .get()!;
const generated = planning.generateFallback(planForFallback, westO, legsDay);
check("generates the requested number of exercises", generated.length, planForFallback.exerciseCount);

const legIds = new Set(
  db
    .select()
    .from(exercises)
    .all()
    .filter((e: { muscleGroup: string }) => e.muscleGroup === "legs")
    .map((e: { id: number }) => e.id)
);
check(
  "every exercise comes from the right muscle group",
  generated.every((entry) => legIds.has(entry.exerciseId)),
  true
);
check(
  "no exercise is repeated",
  new Set(generated.map((e) => e.exerciseId)).size,
  generated.length
);
check(
  "reps land inside the requested range",
  generated.every((entry) =>
    entry.sets.every(
      (set) =>
        set.targetReps !== null &&
        set.targetReps >= planForFallback.targetRepsLow &&
        set.targetReps <= planForFallback.targetRepsHigh
    )
  ),
  true
);

planning.writeGeneratedPlan(planForFallback.id, generated, "fallback");
const detail = planning.planDetail(planForFallback.id)!;
check("written plan reads back with its exercises", detail.exercises.length, generated.length);
check(
  "written plan has sets",
  detail.exercises.every((e) => e.sets.length > 0),
  true
);
check(
  "the plan is marked generated",
  db.select().from(workoutPlans).where(eq(workoutPlans.id, planForFallback.id)).get()?.status,
  "generated"
);

planning.writeGeneratedPlan(planForFallback.id, generated, "fallback");
check(
  "regenerating replaces rather than duplicates",
  db.select().from(planExercises).where(eq(planExercises.planId, planForFallback.id)).all().length,
  generated.length
);
check(
  "orphaned sets are cleaned up with their exercises",
  db.select().from(planSets).all().length,
  generated.reduce((total, entry) => total + entry.sets.length, 0)
);

section("Library constraint with an empty group");
const emptyPlan = { ...planForFallback, exerciseCount: 5 };
const noLibrary = planning.generateFallback(
  emptyPlan,
  westO,
  { ...legsDay, slug: "nonexistent-group" } as typeof legsDay
);
check(
  "an unmapped sub-day falls back to the whole library rather than producing nothing",
  noLibrary.length,
  5
);

section("Rejecting a hallucinated exercise");
const legLibrary = planning.libraryFor(["legs"]);
const realId = legLibrary[0]!.id;
const inventedId = Math.max(...db.select().from(exercises).all().map((e) => e.id)) + 500;

function response(ids: number[]) {
  return {
    summary: "test",
    exercises: ids.map((exerciseId) => ({
      exerciseId,
      note: null,
      sets: [{ targetReps: 10, targetWeightLb: null, isWarmup: false }],
    })),
  };
}

const rejected = generator.validate(response([realId, inventedId]), legLibrary, 2);
check("an id outside the library is rejected", "error" in rejected, true);
check(
  "the rejection names the offending id",
  "error" in rejected && rejected.error.includes(String(inventedId)),
  true
);

const accepted = generator.validate(response([realId]), legLibrary, 2);
check("a response drawn from the library is accepted", "exercises" in accepted, true);

const duplicated = generator.validate(response([realId, realId]), legLibrary, 2);
check(
  "a repeated exercise is collapsed rather than rejected",
  "exercises" in duplicated ? duplicated.exercises.length : -1,
  1
);

const overLong = generator.validate(
  response(legLibrary.slice(0, 4).map((e) => e.id)),
  legLibrary,
  2
);
check(
  "more exercises than asked for are trimmed to the request",
  "exercises" in overLong ? overLong.exercises.length : -1,
  2
);

const emptySets = generator.validate(
  { summary: "test", exercises: [{ exerciseId: realId, note: null, sets: [] }] },
  legLibrary,
  2
);
check("a response with no sets anywhere is rejected", "error" in emptySets, true);

section("Logging a workout against a plan");
const planToComplete = db
  .select()
  .from(workoutPlans)
  .where(eq(workoutPlans.id, planForFallback.id))
  .get()!;
const loggedOnPlan = db
  .insert(workouts)
  .values({
    performedOn: planToComplete.plannedOn,
    workoutTypeId: planToComplete.workoutTypeId,
    workoutSubtypeId: planToComplete.workoutSubtypeId,
    durationSec: 3600,
  })
  .returning({ id: workouts.id })
  .get();

check(
  "logging on a planned day claims the plan",
  planning.linkWorkoutToPlan(loggedOnPlan.id, planToComplete.plannedOn, planToComplete.workoutTypeId),
  planToComplete.id
);
check(
  "the plan is marked completed",
  db.select().from(workoutPlans).where(eq(workoutPlans.id, planToComplete.id)).get()?.status,
  "completed"
);
check(
  "the plan points at the workout",
  db.select().from(workoutPlans).where(eq(workoutPlans.id, planToComplete.id)).get()?.workoutId,
  loggedOnPlan.id
);
check(
  "the workout points back at the plan",
  db.select().from(workouts).where(eq(workouts.id, loggedOnPlan.id)).get()?.planId,
  planToComplete.id
);

const secondOnSameDay = db
  .insert(workouts)
  .values({
    performedOn: planToComplete.plannedOn,
    workoutTypeId: planToComplete.workoutTypeId,
    durationSec: 1800,
  })
  .returning({ id: workouts.id })
  .get();
check(
  "a second workout that day does not steal the claimed plan",
  planning.linkWorkoutToPlan(
    secondOnSameDay.id,
    planToComplete.plannedOn,
    planToComplete.workoutTypeId
  ),
  null
);
check(
  "the plan still points at the first workout",
  db.select().from(workoutPlans).where(eq(workoutPlans.id, planToComplete.id)).get()?.workoutId,
  loggedOnPlan.id
);

const unplannedDay = addDaysIso(planToComplete.plannedOn, 1);
const unplanned = db
  .insert(workouts)
  .values({
    performedOn: unplannedDay,
    workoutTypeId: planToComplete.workoutTypeId,
    durationSec: 1800,
  })
  .returning({ id: workouts.id })
  .get();
check(
  "a workout on an unplanned day links to nothing",
  planning.linkWorkoutToPlan(unplanned.id, unplannedDay, planToComplete.workoutTypeId),
  null
);

section("Plan parameter bounds");
const sane = { targetRepsLow: 8, targetRepsHigh: 12, restSeconds: 90, exerciseCount: 6 };
check("a sensible week passes", planning.planParamError(sane), null);
check(
  "ninety-nine exercises is rejected",
  planning.planParamError({ ...sane, exerciseCount: 99 }) !== null,
  true
);
check(
  "zero exercises is rejected",
  planning.planParamError({ ...sane, exerciseCount: 0 }) !== null,
  true
);
check(
  "an inverted rep range is rejected",
  planning.planParamError({ ...sane, targetRepsLow: 12, targetRepsHigh: 6 }),
  "the low rep target cannot exceed the high one"
);
check(
  "a hundred reps is rejected",
  planning.planParamError({ ...sane, targetRepsHigh: 100 }) !== null,
  true
);
check(
  "an hour of rest is rejected",
  planning.planParamError({ ...sane, restSeconds: 3600 }) !== null,
  true
);
check("no rest at all is allowed", planning.planParamError({ ...sane, restSeconds: 0 }), null);
check(
  "the upper bounds themselves are allowed",
  planning.planParamError({
    targetRepsLow: 1,
    targetRepsHigh: planning.PLAN_LIMITS.reps.max,
    restSeconds: planning.PLAN_LIMITS.restSeconds.max,
    exerciseCount: planning.PLAN_LIMITS.exerciseCount.max,
  }),
  null
);

section("Exercise and set logging");
const benchId = db.select().from(exercises).where(eq(exercises.slug, "barbell-bench-press")).get()!.id;
const squatId = db.select().from(exercises).where(eq(exercises.slug, "back-squat")).get()!.id;

const march = db
  .insert(workouts)
  .values({ performedOn: "2026-03-02", workoutTypeId: westO.id, workoutSubtypeId: chestDay.id })
  .returning({ id: workouts.id })
  .get();

const firstBench = logbook.addExercise(march.id, benchId);
check("a first-time exercise gets three blank sets", logbook.workoutLog(march.id)[0]?.sets.length, 3);
check(
  "a first-time exercise has no reps prefilled",
  logbook.workoutLog(march.id)[0]?.sets.every((s) => s.reps === null && s.weightLb === null),
  true
);
check(
  "adding the same exercise twice does not duplicate it",
  logbook.addExercise(march.id, benchId),
  firstBench
);

const marchSets = logbook.workoutLog(march.id)[0]!.sets;
marchSets.forEach((set, index) => {
  logbook.updateSet(set.id, { reps: 8, weightLb: 185 + index * 10 });
});
check(
  "sets save what was typed",
  logbook.workoutLog(march.id)[0]?.sets.map((s) => `${s.reps}x${s.weightLb}`),
  ["8x185", "8x195", "8x205"]
);

section("Prefilling the next session from the last one");
const april = db
  .insert(workouts)
  .values({ performedOn: "2026-04-06", workoutTypeId: westO.id, workoutSubtypeId: chestDay.id })
  .returning({ id: workouts.id })
  .get();
logbook.addExercise(april.id, benchId);
const aprilEntry = logbook.workoutLog(april.id)[0]!;
check("the new session copies the set count", aprilEntry.sets.length, 3);
check(
  "the new session copies last time's numbers",
  aprilEntry.sets.map((s) => `${s.reps}x${s.weightLb}`),
  ["8x185", "8x195", "8x205"]
);
check("last time is attributed to the right day", aprilEntry.lastTime?.performedOn, "2026-03-02");
check(
  "the earlier session is not told about the later one",
  logbook.workoutLog(march.id)[0]?.lastTime,
  null
);

section("Working volume");
const volume = logbook.workoutVolume(march.id);
check("volume counts every working set", volume.sets, 3);
check("volume sums reps", volume.reps, 24);
check("volume multiplies reps by weight", volume.volumeLb, 8 * 185 + 8 * 195 + 8 * 205);

const warmupId = logbook.addSet(firstBench, true);
logbook.updateSet(warmupId, { reps: 10, weightLb: 45 });
check("a warmup is excluded from volume", logbook.workoutVolume(march.id).volumeLb, volume.volumeLb);
check("a warmup still shows in the log", logbook.workoutLog(march.id)[0]?.sets.length, 4);
logbook.removeSet(warmupId);

section("Reordering and removing");
logbook.addExercise(march.id, squatId);
check(
  "a second movement lands after the first",
  logbook.workoutLog(march.id).map((e) => e.exercise.id),
  [benchId, squatId]
);
check("moving the first one up does nothing", logbook.moveExercise(firstBench, "up"), false);
check("moving the first one down works", logbook.moveExercise(firstBench, "down"), true);
check(
  "the order actually changed",
  logbook.workoutLog(march.id).map((e) => e.exercise.id),
  [squatId, benchId]
);

logbook.removeExercise(firstBench);
const afterRemoval = logbook.workoutLog(march.id);
check("removing leaves the other movement", afterRemoval.length, 1);
check("positions close up after a removal", afterRemoval[0]?.position, 0);
check(
  "removing an exercise takes its sets with it",
  db.select().from(exerciseSets).where(eq(exerciseSets.workoutExerciseId, firstBench)).all().length,
  0
);

section("Starting a session from its plan");
const planForLog = db
  .select()
  .from(workoutPlans)
  .where(eq(workoutPlans.id, planForFallback.id))
  .get()!;
const fromPlan = db
  .insert(workouts)
  .values({
    performedOn: "2026-05-04",
    workoutTypeId: planForLog.workoutTypeId,
    workoutSubtypeId: planForLog.workoutSubtypeId,
  })
  .returning({ id: workouts.id })
  .get();

const plannedCount = planning.planDetail(planForLog.id)!.exercises.length;
check(
  "the plan copies across",
  logbook.prefillFromPlan(fromPlan.id, planForLog.id),
  plannedCount
);
check("the session now has the planned movements", logbook.workoutLog(fromPlan.id).length, plannedCount);
check(
  "target reps arrive as logged reps to overwrite",
  logbook.workoutLog(fromPlan.id)[0]?.sets.every((s) => s.reps !== null),
  true
);
check(
  "prefilling twice does not double up",
  logbook.prefillFromPlan(fromPlan.id, planForLog.id),
  0
);
check(
  "the session still has the planned movements",
  logbook.workoutLog(fromPlan.id).length,
  plannedCount
);

section("Body metrics");
check(
  "a first reading is created",
  body.recordMetrics("2026-06-01", { weightLb: 205, fatMassLb: 41, muscleMassLb: 78 }).created,
  true
);
check(
  "a second reading the same day merges rather than stacking",
  body.recordMetrics("2026-06-01", { weightLb: 204.2 }).created,
  false
);
check("the merged reading kept the new weight", body.metricsInRange("2026-06-01", "2026-06-01")[0]?.weightLb, 204.2);
check(
  "a field left out of the second reading survives",
  body.metricsInRange("2026-06-01", "2026-06-01")[0]?.fatMassLb,
  41
);
check(
  "one day means one row",
  body.metricsInRange("2026-06-01", "2026-06-01").length,
  1
);
check(
  "a field sent as null is cleared",
  (() => {
    body.recordMetrics("2026-06-01", { muscleMassLb: null });
    return body.metricsInRange("2026-06-01", "2026-06-01")[0]?.muscleMassLb;
  })(),
  null
);

body.recordMetrics("2026-07-01", { weightLb: 200, fatMassLb: 36 });
body.recordMetrics("2026-08-01", { weightLb: 196, fatMassLb: 33 });

section("Body metric series");
const weightSeries = body.seriesFor("weightLb", 90, "2026-08-12");
check("the series picks up every reading in the window", weightSeries.points.length, 3);
check("the series runs oldest to newest", weightSeries.points[0]?.measuredOn, "2026-06-01");
check("the latest value is the most recent one", weightSeries.latest, 196);
check(
  "the change is measured against the oldest reading",
  Math.round((weightSeries.change ?? 0) * 10) / 10,
  -8.2
);
check(
  "a reading outside the window is left out",
  body.seriesFor("weightLb", 30, "2026-08-12").points.length,
  1
);
check(
  "a metric never recorded has no points",
  body.seriesFor("bodyFatPct", 90, "2026-08-12").points.length,
  0
);
check(
  "a single reading has no change to report",
  body.seriesFor("weightLb", 30, "2026-08-12").change,
  null
);

section("Derived body fat");
const august = body.metricsInRange("2026-08-01", "2026-08-01")[0]!;
check("body fat is worked out from weight and fat mass", body.derivedBodyFatPct(august), 16.8);
body.recordMetrics("2026-08-01", { bodyFatPct: 15.2 });
check(
  "a measured percentage wins over the derived one",
  body.derivedBodyFatPct(body.metricsInRange("2026-08-01", "2026-08-01")[0]!),
  15.2
);
check(
  "nothing is invented without the inputs",
  body.derivedBodyFatPct({
    ...august,
    weightLb: null,
    bodyFatPct: null,
  }),
  null
);

section("Rest formatting");
check("under a minute reads in seconds", format.fmtRest(45), "45s");
check("ninety seconds reads as a minute and a half", format.fmtRest(90), "1:30");
check("two minutes reads evenly", format.fmtRest(120), "2:00");
check("three minutes reads evenly", format.fmtRest(180), "3:00");
check("no rest reads as a dash", format.fmtRest(0), "—");

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
