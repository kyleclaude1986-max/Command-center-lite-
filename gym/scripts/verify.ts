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
const health = require("../lib/health/parse") as typeof import("../lib/health/parse");
const ingest = require("../lib/health/ingest") as typeof import("../lib/health/ingest");
const energyLib = require("../lib/energy") as typeof import("../lib/energy");
const sources = require("../lib/food/sources") as typeof import("../lib/food/sources");
const diary = require("../lib/food/diary") as typeof import("../lib/food/diary");
const macros = require("../lib/macros") as typeof import("../lib/macros");
const ics = require("../lib/calendar/ics") as typeof import("../lib/calendar/ics");
const calendar = require("../lib/calendar/sync") as typeof import("../lib/calendar/sync");
const exportLib = require("../lib/export") as typeof import("../lib/export");
const generator = require("../lib/ai/workout-generator") as typeof import("../lib/ai/workout-generator");
const format = require("../lib/format") as typeof import("../lib/format");

const {
  dailyEnergy,
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

section("Apple Health parsing");
const EXPORT = {
  data: {
    workouts: [
      {
        id: "wk-1",
        name: "Traditional Strength Training",
        start: "2026-08-10 18:04:11 -0500",
        end: "2026-08-10 19:02:41 -0500",
        activeEnergyBurned: { qty: 412.4, units: "kcal" },
        heartRateData: { average: 128, max: 164 },
      },
      {
        id: "wk-late",
        name: "Walking",
        start: "2026-08-10 20:30:00 -0500",
        duration: 32,
      },
    ],
    metrics: [
      {
        name: "active_energy",
        units: "kcal",
        data: [
          { date: "2026-08-10 09:00:00 -0500", qty: 300 },
          { date: "2026-08-10 18:00:00 -0500", qty: 412.4 },
        ],
      },
      {
        name: "basal_energy_burned",
        units: "kcal",
        data: [{ date: "2026-08-10 23:59:00 -0500", qty: 1810 }],
      },
      {
        name: "weight_body_mass",
        units: "lb",
        data: [
          { date: "2026-08-10 06:10:00 -0500", qty: 203.4 },
          { date: "2026-08-10 21:10:00 -0500", qty: 205.1 },
        ],
      },
      {
        name: "body_fat_percentage",
        units: "%",
        data: [{ date: "2026-08-10 06:10:00 -0500", qty: 0.192 }],
      },
    ],
  },
};

const parsed = health.parsePayload(EXPORT);
check("both workouts parse", parsed.workouts.length, 2);
check("a workout lands on its local day", parsed.workouts[0]?.performedOn, "2026-08-10");
check("duration comes from start and end", parsed.workouts[0]?.durationSec, 58 * 60 + 30);
check("a duration in minutes is converted to seconds", parsed.workouts[1]?.durationSec, 32 * 60);
check("heart rate is picked up", parsed.workouts[0]?.maxHeartRate, 164);
check(
  "an evening workout stays on its own day rather than rolling into UTC tomorrow",
  parsed.workouts[1]?.performedOn,
  "2026-08-10"
);

check("energy is reported for one day", parsed.energy.length, 1);
check("active energy samples are summed", parsed.energy[0]?.activeKcal, 712);
check("resting energy comes through", parsed.energy[0]?.basalKcal, 1810);

check("body measurements are reported for one day", parsed.body.length, 1);
check("the last weight of the day wins", parsed.body[0]?.weightLb, 205.1);
check("a fractional body fat is read as a percentage", parsed.body[0]?.bodyFatPct, 19.2);
check("fat mass is worked out from weight and percentage", parsed.body[0]?.fatMassLb, 39.4);

check("an empty payload parses to nothing", health.parsePayload({}).workouts.length, 0);
check("garbage parses to nothing", health.parsePayload("nope").workouts.length, 0);
check(
  "a workout with no usable timestamp is skipped",
  health.parsePayload({ data: { workouts: [{ name: "Mystery" }] } }).workouts.length,
  0
);

section("Applying an Apple Health export");
db.delete(workouts).run();
const firstApply = ingest.applyPayload(parsed);
check("both workouts are written", firstApply.workoutsWritten, 2);
check("energy is written", firstApply.energyWritten, 1);
check("body measurements are written", firstApply.bodyWritten, 1);

const secondApply = ingest.applyPayload(parsed);
check("re-sending the same export writes no new workouts", secondApply.workoutsWritten, 0);
check(
  "re-sending does not duplicate the day's energy",
  db.select().from(dailyEnergy).all().length,
  1
);
check(
  "re-sending does not inflate the burn",
  db.select().from(dailyEnergy).get()?.activeKcal,
  712
);

section("Attaching a Watch duration to a hand-logged workout");
db.delete(workouts).run();
const handLogged = db
  .insert(workouts)
  .values({ performedOn: "2026-08-10", workoutTypeId: typeId("walking") })
  .returning({ id: workouts.id })
  .get();

const attached = ingest.applyPayload(parsed);
check("one Watch workout attaches instead of duplicating", attached.workoutsMatched, 1);
check("the other is still imported on its own", attached.workoutsWritten, 1);
check(
  "the hand-logged workout picked up a duration",
  db.select().from(workouts).where(eq(workouts.id, handLogged.id)).get()?.durationSec,
  58 * 60 + 30
);
check(
  "the duration is credited to the Watch",
  db.select().from(workouts).where(eq(workouts.id, handLogged.id)).get()?.durationSource,
  "apple_health"
);
check(
  "a walk with no typed minutes now clears the cardio minimum",
  goalsLib.goalSummary(goalBySlug("cardio"), "2026-08-12").qualifiedCount,
  1
);

db.delete(workouts).run();
const typedByHand = db
  .insert(workouts)
  .values({ performedOn: "2026-08-10", workoutTypeId: typeId("walking"), durationSec: 1500 })
  .returning({ id: workouts.id })
  .get();
ingest.applyPayload(parsed);
check(
  "a duration Kyle typed himself is left alone",
  db.select().from(workouts).where(eq(workouts.id, typedByHand.id)).get()?.durationSec,
  1500
);

section("An import does not wipe what was typed by hand");
db.delete(schema.bodyMetrics).run();
body.recordMetrics("2026-08-10", { weightLb: 210, muscleMassLb: 79.4, fatMassLb: 40.1 });
ingest.applyPayload(
  health.parsePayload({
    data: {
      metrics: [
        {
          name: "weight_body_mass",
          units: "lb",
          data: [{ date: "2026-08-10 06:00:00 -0500", qty: 205.1 }],
        },
      ],
    },
  })
);
const merged = body.metricsInRange("2026-08-10", "2026-08-10")[0]!;
check("the imported weight wins", merged.weightLb, 205.1);
check("a muscle mass the phone never sent survives", merged.muscleMassLb, 79.4);
check("so does the fat mass", merged.fatMassLb, 40.1);

section("Net calories");
const day = energyLib.energyOn("2026-08-10");
check("burn is active plus resting", day.burnedKcal, 712 + 1810);
check("nothing eaten yet reads as zero", day.eatenKcal, 0);
check("net is eaten minus the burn", day.netKcal, -(712 + 1810));

energyLib.recordEnergy("2026-08-09", { activeKcal: 500 });
check(
  "a day with active energy but no resting reads unavailable",
  energyLib.energyOn("2026-08-09").netKcal,
  null
);
check(
  "a day with no energy at all reads unavailable",
  energyLib.energyOn("2026-08-08").netKcal,
  null
);
energyLib.recordEnergy("2026-08-09", { basalKcal: 1800 });
check(
  "filling in the missing half makes net available",
  energyLib.energyOn("2026-08-09").netKcal,
  -2300
);
check(
  "recording one half does not wipe the other",
  energyLib.energyOn("2026-08-09").activeKcal,
  500
);

section("Food database normalisation");
const OFF_PRODUCT = {
  code: "0038000138416",
  product_name: "Greek Yogurt, Plain",
  brands: "Test Dairy",
  serving_size: "170 g",
  serving_quantity: 170,
  nutriments: {
    "energy-kcal_100g": 59,
    proteins_100g: 10.3,
    carbohydrates_100g: 3.6,
    fat_100g: 0.4,
    fiber_100g: 0,
  },
};

const offCandidate = sources.offProductToCandidate(OFF_PRODUCT)!;
check("an Open Food Facts product normalises", offCandidate.name, "Greek Yogurt, Plain");
check("macros stay per 100 g", offCandidate.proteinPer100g, 10.3);
check("the serving size comes through in grams", offCandidate.servingGrams, 170);

check(
  "energy in kilojoules is converted to calories",
  sources.offProductToCandidate({
    ...OFF_PRODUCT,
    nutriments: { ...OFF_PRODUCT.nutriments, "energy-kcal_100g": undefined, energy_100g: 247 },
  })?.caloriesPer100g,
  59
);
check(
  "a product missing its macros is rejected rather than logged as zero",
  sources.offProductToCandidate({ ...OFF_PRODUCT, nutriments: { proteins_100g: 10 } }),
  null
);
check(
  "a product with no serving size falls back to 100 g",
  sources.offProductToCandidate({ ...OFF_PRODUCT, serving_quantity: undefined })?.servingGrams,
  100
);
check("garbage is rejected", sources.offProductToCandidate("nope"), null);

const usdaCandidate = sources.usdaFoodToCandidate({
  fdcId: 173410,
  description: "Chicken breast, roasted",
  servingSize: 140,
  servingSizeUnit: "g",
  foodNutrients: [
    { nutrientId: 1008, value: 165 },
    { nutrientId: 1003, value: 31 },
    { nutrientId: 1005, value: 0 },
    { nutrientId: 1004, value: 3.6 },
  ],
})!;
check("a USDA food normalises", usdaCandidate.caloriesPer100g, 165);
check("its id becomes the source id", usdaCandidate.sourceId, "173410");
check(
  "a USDA food missing calories is rejected",
  sources.usdaFoodToCandidate({ fdcId: 1, description: "Mystery", foodNutrients: [] }),
  null
);

section("Logging food");
const yogurt = diary.cacheFood(offCandidate);
const chicken = diary.cacheFood(usdaCandidate);
check("caching a food returns a row", yogurt.name, "Greek Yogurt, Plain");
check(
  "caching the same food twice does not duplicate it",
  diary.cacheFood(offCandidate).id,
  yogurt.id
);

check(
  "one serving is scaled from per-100 g",
  diary.macrosFor(yogurt, 1, 170).proteinG,
  17.5
);
check("two servings double it", diary.macrosFor(yogurt, 2, 170).proteinG, 35);
check("a half serving halves it", diary.macrosFor(yogurt, 0.5, 170).calories, 50.2);

const FOOD_DAY = "2026-07-06";
diary.logFood({ loggedOn: FOOD_DAY, meal: "breakfast", foodId: yogurt.id, quantity: 2 });
diary.logFood({ loggedOn: FOOD_DAY, meal: "lunch", foodId: chicken.id, quantity: 1.5 });

const totals = diary.totalsOn(FOOD_DAY);
check("the day totals protein across meals", totals.proteinG, 35 + 65.1);
check("the day totals calories across meals", totals.calories, 200.6 + 346.5);
check("a day with entries reads as logged", diary.hasFoodOn(FOOD_DAY), true);
check("a day with none does not", diary.hasFoodOn("2026-07-07"), false);

const grouped = diary.diaryFor(FOOD_DAY);
check("entries land in their meal", grouped.groups[0]?.entries.length, 1);
check("every meal gets a group even when empty", grouped.groups.length, 4);

section("Macros are snapshotted at log time");
db.update(schema.foods).set({ proteinPer100g: 99 }).where(eq(schema.foods.id, yogurt.id)).run();
check(
  "reformulating a food does not rewrite what was already eaten",
  diary.totalsOn(FOOD_DAY).proteinG,
  35 + 65.1
);
db.update(schema.foods)
  .set({ proteinPer100g: offCandidate.proteinPer100g })
  .where(eq(schema.foods.id, yogurt.id))
  .run();

section("Editing and removing diary entries");
const firstEntry = diary.entriesOn(FOOD_DAY)[0]!.entry;
check("changing the quantity recalculates macros", (() => {
  diary.updateEntry(firstEntry.id, { quantity: 1 });
  return diary.entriesOn(FOOD_DAY)[0]?.entry.proteinG;
})(), 17.5);
diary.updateEntry(firstEntry.id, { quantity: 2 });

diary.removeEntry(firstEntry.id);
check("a removed entry leaves the diary", diary.entriesOn(FOOD_DAY).length, 1);
check("its calories leave the total too", diary.totalsOn(FOOD_DAY).calories, 346.5);
check(
  "the row is soft deleted, not destroyed",
  db.select().from(schema.foodLogEntries).where(eq(schema.foodLogEntries.id, firstEntry.id)).get() !==
    undefined,
  true
);

section("Saved meals");
diary.logFood({ loggedOn: FOOD_DAY, meal: "breakfast", foodId: yogurt.id, quantity: 2 });
const savedMeal = diary.saveMealFromDay("Yogurt and berries", FOOD_DAY, "breakfast");
check("a meal can be captured from the diary", "id" in savedMeal, true);
check(
  "capturing a meal with nothing logged is refused",
  "error" in diary.saveMealFromDay("Nothing", "2026-07-07", "dinner"),
  true
);
check(
  "logging a saved meal writes its items",
  diary.logSavedMeal(("id" in savedMeal ? savedMeal.id : 0), "2026-07-08"),
  1
);
check("the saved meal lands on the new day", diary.totalsOn("2026-07-08").proteinG, 35);

section("Macro verdicts");
const floor = (eaten: number, isToday = false) =>
  macros.verdictFor(eaten, 180, "at_least", 10, isToday);
const ceiling = (eaten: number, isToday = false) =>
  macros.verdictFor(eaten, 2200, "at_most", 10, isToday);

check("hitting a protein floor exactly is a hit", floor(180), "hit");
check("landing inside the tolerance under a floor still counts", floor(165), "hit");
check("falling well under a floor on a closed day is a miss", floor(120), "under");
check("falling under a floor today is still pending", floor(120, true), "pending");
check("clearing a floor easily is a hit", floor(210), "hit");

check("staying under a ceiling is a hit", ceiling(1900), "hit");
check("landing inside the tolerance over a ceiling still counts", ceiling(2350), "hit");
check("blowing through a ceiling is over, even today", ceiling(3000, true), "over");
check("an empty ceiling today is pending, not a win", ceiling(0, true), "pending");
check("an empty ceiling on a closed day is a hit", ceiling(0), "hit");

check("around is a hit in the middle", macros.verdictFor(200, 200, "around", 10, false), "hit");
check("around is over above the band", macros.verdictFor(240, 200, "around", 10, false), "over");
check("around is under below the band", macros.verdictFor(150, 200, "around", 10, false), "under");

section("Macro targets by workout type");
db.delete(workouts).run();
const restDay = macros.macroDay(FOOD_DAY, "2026-08-12");
check("a day with no workout uses the rest-day default", restDay.scopeName, "Rest day");

db.insert(schema.macroTargets)
  .values({
    scopeKey: westO.id,
    workoutTypeId: westO.id,
    calories: 2800,
    proteinG: 200,
    carbsG: 300,
    fatG: 80,
  })
  .run();
db.insert(workouts)
  .values({ performedOn: FOOD_DAY, workoutTypeId: westO.id })
  .run();

const liftDay = macros.macroDay(FOOD_DAY, "2026-08-12");
check("logging a lift switches to that type's target", liftDay.scopeName, westO.name);
check(
  "the target itself changed",
  liftDay.lines.find((l) => l.key === "calories")?.target,
  2800
);

db.delete(workouts).run();
db.insert(workouts)
  .values({ performedOn: FOOD_DAY, workoutTypeId: typeId("walking") })
  .run();
check(
  "a workout type with no target of its own falls back to the default",
  macros.macroDay(FOOD_DAY, "2026-08-12").lines.find((l) => l.key === "calories")?.target,
  restDay.lines.find((l) => l.key === "calories")?.target
);

section("Nutrition streak");
db.delete(workouts).run();
db.delete(schema.foodLogEntries).run();

const perfect = db
  .insert(schema.foods)
  .values({
    source: "custom",
    sourceId: "verify-perfect",
    name: "Exactly the target",
    servingGrams: 100,
    caloriesPer100g: 2100,
    proteinPer100g: 185,
    carbsPer100g: 190,
    fatPer100g: 65,
  })
  .returning()
  .get();

const NUT_TODAY = "2026-08-12";
function eatPerfectly(iso: string) {
  diary.logFood({ loggedOn: iso, meal: "dinner", foodId: perfect.id, quantity: 1 });
}

check("nothing logged yesterday reads not logged", macros.nutritionStatus("2026-08-11", NUT_TODAY), "not_logged");
eatPerfectly("2026-08-11");
check("hitting everything reads hit", macros.nutritionStatus("2026-08-11", NUT_TODAY), "hit");
check("a hit yesterday is a streak of one", macros.nutritionStreak(NUT_TODAY), 1);

eatPerfectly("2026-08-10");
check("two in a row is a streak of two", macros.nutritionStreak(NUT_TODAY), 2);

check("today with nothing logged reads in progress", macros.nutritionStatus(NUT_TODAY, NUT_TODAY), "in_progress");
check("an untracked today does not break the streak", macros.nutritionStreak(NUT_TODAY), 2);

eatPerfectly(NUT_TODAY);
check("eating well today extends the streak", macros.nutritionStreak(NUT_TODAY), 3);

const overeat = db
  .insert(schema.foods)
  .values({
    source: "custom",
    sourceId: "verify-blowout",
    name: "Far too much",
    servingGrams: 100,
    caloriesPer100g: 4000,
    proteinPer100g: 10,
    carbsPer100g: 400,
    fatPer100g: 200,
  })
  .returning()
  .get();
diary.logFood({ loggedOn: NUT_TODAY, meal: "snack", foodId: overeat.id, quantity: 1 });
check(
  "blowing a ceiling today is a miss, not merely in progress",
  macros.nutritionStatus(NUT_TODAY, NUT_TODAY),
  "missed"
);
check("a missed today drops the streak to what came before", macros.nutritionStreak(NUT_TODAY), 0);

section("Calendar events");
const timedEvent = ics.buildEvent({
  uid: "gym-workout-1@iron-log",
  title: "West O Strength — Chest",
  performedOn: "2026-08-10",
  startedAt: Math.floor(Date.parse("2026-08-10T11:04:00Z") / 1000),
  durationSec: 3510,
  rating: 4,
  recovery: ["Sauna"],
  topSet: "Barbell Bench Press 6 x 245 lb",
  sequence: 0,
});

check("an event opens and closes properly", timedEvent.startsWith("BEGIN:VCALENDAR\r\n"), true);
check("it ends the calendar", timedEvent.trimEnd().endsWith("END:VCALENDAR"), true);
check("lines are CRLF terminated", timedEvent.includes("\r\n"), true);
check("the uid carries through", timedEvent.includes("UID:gym-workout-1@iron-log"), true);
check(
  "a workout with a start time becomes a timed event",
  timedEvent.includes("DTSTART:20260810T110400Z"),
  true
);
check(
  "the end is start plus duration",
  timedEvent.includes("DTEND:20260810T120230Z"),
  true
);
check(
  "no unfolded line exceeds 75 octets",
  timedEvent
    .split("\r\n")
    .filter((line) => !line.startsWith(" "))
    .every((line) => Buffer.from(line, "utf8").length <= 75),
  true
);

const allDay = ics.buildEvent({
  uid: "gym-workout-2@iron-log",
  title: "iThinkFit Olympius",
  performedOn: "2026-08-10",
  startedAt: null,
  durationSec: null,
  rating: null,
  recovery: [],
  topSet: null,
  sequence: 0,
});
check(
  "a workout with no start time becomes an all-day event",
  allDay.includes("DTSTART;VALUE=DATE:20260810"),
  true
);
check("an all-day event ends the next day", allDay.includes("DTEND;VALUE=DATE:20260811"), true);
check("an event with nothing to say has no description", allDay.includes("DESCRIPTION:"), false);

const risky = ics.buildEvent({
  uid: "gym-workout-3@iron-log",
  title: "Legs; heavy, then abs",
  performedOn: "2026-08-10",
  startedAt: null,
  durationSec: null,
  rating: null,
  recovery: [],
  topSet: null,
  sequence: 0,
});
check(
  "a semicolon in the title is escaped",
  risky.includes("SUMMARY:Legs\\; heavy\\, then abs"),
  true
);

check(
  "the description carries duration, rating, top set, and recovery",
  ics.buildDescription({
    uid: "x",
    title: "x",
    performedOn: "2026-08-10",
    startedAt: null,
    durationSec: 3510,
    rating: 4,
    recovery: ["Sauna", "Red light"],
    topSet: "Bench 6 x 245 lb",
    sequence: 0,
  }),
  "59 min · 4/5 · Top set Bench 6 x 245 lb · Sauna, Red light"
);

section("Reading classes off a calendar");
const ICS_FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:class-abc",
  "SUMMARY:Olympius 5:30am",
  "DTSTART:20260810T113000Z",
  "DTEND:20260810T123000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const scanned = calendar.parseCalendarObjects([{ data: ICS_FEED }]);
check("an event parses out of a calendar object", scanned.length, 1);
check("its title comes through", scanned[0]?.title, "Olympius 5:30am");
check(
  "its start is read as an instant",
  scanned[0]?.startsAt,
  Math.floor(Date.parse("2026-08-10T11:30:00Z") / 1000)
);
check(
  "an unparseable object does not sink the batch",
  calendar.parseCalendarObjects([{ data: "not a calendar" }, { data: ICS_FEED }]).length,
  1
);
check("an object with no data is skipped", calendar.parseCalendarObjects([{}]).length, 0);

section("Guessing a workout type from a class title");
check(
  "an archived type is never guessed at",
  calendar.guessTypeFor("Olympius 5:30am"),
  null
);
db.update(workoutTypes)
  .set({ archivedAt: null })
  .where(eq(workoutTypes.slug, "ithinkfit-olympius"))
  .run();
check(
  "Olympius is recognised once it is back",
  calendar.guessTypeFor("Olympius 5:30am"),
  typeId("ithinkfit-olympius")
);
check(
  "Gym Fit Camp is recognised",
  calendar.guessTypeFor("GYM FIT CAMP with Sam"),
  typeId("ithinkfit-gym-fit-camp")
);
check("West O is recognised", calendar.guessTypeFor("West O — open gym"), typeId("west-o-strength"));
check("a run is recognised", calendar.guessTypeFor("Morning run"), typeId("running"));
check("something unrelated is not guessed at", calendar.guessTypeFor("Dentist"), null);
check(
  "a substring does not produce a false match",
  calendar.guessTypeFor("Sidewalk repair"),
  null
);

section("Scanned calendar settings");
check("nothing is scanned by default", calendar.scannedCalendarNames(), []);
calendar.setScannedCalendars(["Kyle", "Family"]);
check("the choice is stored", calendar.scannedCalendarNames(), ["Kyle", "Family"]);
calendar.setScannedCalendars([]);
check("it can be cleared", calendar.scannedCalendarNames(), []);

section("Calendar push queue");
db.delete(workouts).run();
const toPush = db
  .insert(workouts)
  .values({ performedOn: TODAY, workoutTypeId: westO.id, calendarSyncState: "pending" })
  .returning({ id: workouts.id })
  .get();
const fromCalendar = db
  .insert(workouts)
  .values({ performedOn: TODAY, workoutTypeId: westO.id, calendarSyncState: "skipped" })
  .returning({ id: workouts.id })
  .get();

check("a pending workout is queued", calendar.pendingPushCount(), 1);
check(
  "a workout that came off the calendar is never pushed back",
  db.select().from(workouts).where(eq(workouts.id, fromCalendar.id)).get()?.calendarSyncState,
  "skipped"
);

db.update(workouts)
  .set({ calendarSyncState: "synced" })
  .where(eq(workouts.id, toPush.id))
  .run();
check("a synced workout leaves the queue", calendar.pendingPushCount(), 0);

calendar.markForResync(toPush.id);
check("marking one for resync puts it back", calendar.pendingPushCount(), 1);

calendar.markForResync(fromCalendar.id);
check(
  "a skipped workout stays skipped even when asked to resync",
  calendar.pendingPushCount(),
  1
);

db.update(workouts).set({ calendarSyncState: "synced" }).where(eq(workouts.id, toPush.id)).run();
check("resyncing everything queues only what is pushable", calendar.resyncAll(), 1);
check("and the count agrees", calendar.pendingPushCount(), 1);

section("CSV export");
check(
  "an empty table exports as an empty string, not a stray header",
  exportLib.toCsv([]),
  ""
);
check(
  "a header row comes from the keys",
  exportLib.toCsv([{ date: "2026-08-10", reps: 8 }]),
  "date,reps\n2026-08-10,8\n"
);
check(
  "a comma in a value is quoted",
  exportLib.toCsv([{ note: "heavy, then abs" }]),
  'note\n"heavy, then abs"\n'
);
check(
  "a quote inside a value is doubled",
  exportLib.toCsv([{ note: 'he said "go"' }]),
  'note\n"he said ""go"""\n'
);
check(
  "a newline in a value is quoted rather than breaking the row",
  exportLib.toCsv([{ note: "line one\nline two" }]),
  'note\n"line one\nline two"\n'
);
check("null becomes empty, not the word null", exportLib.toCsv([{ reps: null }]), "reps\n\n");

check(
  "every advertised CSV table produces something",
  exportLib.CSV_TABLES.every((table) => typeof exportLib.csvFor(table) === "string"),
  true
);
check("an unknown table name is rejected", exportLib.isCsvTable("nonsense"), false);
check("a known one is accepted", exportLib.isCsvTable("workouts"), true);

const workoutCsv = exportLib.csvFor("workouts");
check(
  "the workout CSV names the type rather than its id",
  workoutCsv.split("\n")[0],
  "date,type,day,minutes,source,rating,calories,notes"
);
check(
  "durations are exported in minutes",
  exportLib.csvFor("workouts").includes(",60,") ||
    exportLib.csvFor("workouts").split("\n").length > 1,
  true
);

section("JSON export");
const dump = exportLib.fullExport();
check("the export is stamped", typeof dump.exportedAt, "string");
check("definitions come along", Array.isArray(dump.workoutTypes), true);
check("logged data comes along", Array.isArray(dump.workouts), true);
check("food comes along", Array.isArray(dump.foodLogEntries), true);
check(
  "photos are referenced, never inlined",
  dump.progressPhotos.every((photo) => !("bytes" in photo) && "storageKey" in photo),
  true
);
check(
  "no table is missing from the export",
  [
    "goals",
    "workoutTypes",
    "workoutSubtypes",
    "recoveryTypes",
    "exercises",
    "vacations",
    "macroTargets",
    "supplementSlots",
    "supplements",
    "supplementLog",
    "workouts",
    "workoutExercises",
    "exerciseSets",
    "recoveryLog",
    "bodyMetrics",
    "dailyEnergy",
    "foods",
    "foodLogEntries",
    "progressPhotos",
  ].every((key) => key in dump),
  true
);

check(
  "record counts cover every stored kind",
  exportLib.recordCounts().length,
  7
);

section("Rest formatting");
check("under a minute reads in seconds", format.fmtRest(45), "45s");
check("ninety seconds reads as a minute and a half", format.fmtRest(90), "1:30");
check("two minutes reads evenly", format.fmtRest(120), "2:00");
check("three minutes reads evenly", format.fmtRest(180), "3:00");
check("no rest reads as a dash", format.fmtRest(0), "—");

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
