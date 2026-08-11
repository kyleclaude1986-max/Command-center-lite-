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

const {
  goals,
  recoveryLog,
  recoveryTypes,
  supplementLog,
  supplements,
  supplementSlots,
  vacations,
  workouts,
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

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
