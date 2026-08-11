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

const { goals, recoveryLog, recoveryTypes, vacations, workouts, workoutTypes } = schema;
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
logWorkout("ithinkfit-olympus", addDaysIso(WEEK, 1));
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
logWorkout("ithinkfit-olympus", WEEK);
check("logged before archiving", summary("gym").qualifiedCount, 1);
db.update(workoutTypes)
  .set({ archivedAt: Math.floor(Date.now() / 1000) })
  .where(eq(workoutTypes.slug, "ithinkfit-olympus"))
  .run();
check("archived type still counts its history", summary("gym").qualifiedCount, 1);

section("Soft delete");
reset();
logWorkout("west-o-strength", WEEK);
check("logged", summary("gym").qualifiedCount, 1);
db.update(workouts).set({ deletedAt: Math.floor(Date.now() / 1000) }).run();
check("soft deleted workout stops counting", summary("gym").qualifiedCount, 0);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
