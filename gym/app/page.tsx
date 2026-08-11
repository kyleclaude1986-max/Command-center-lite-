import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { GoalCard } from "@/components/GoalCard";
import { QuickRecovery } from "@/components/QuickRecovery";
import { RatingButtons } from "@/components/RatingButtons";
import { WorkoutListItem } from "@/components/WorkoutListItem";
import { SupplementSlots, type SlotGroupView } from "@/components/SupplementSlots";
import { fmtIsoDay, fmtIsoRelative, todayIso } from "@/lib/dates";
import { goalSummaries } from "@/lib/goals";
import { pluralize } from "@/lib/format";
import {
  getActiveRecoveryTypes,
  getRecoveryOn,
  getUnratedWorkouts,
  getWorkoutsOn,
} from "@/lib/queries";
import { slotGroupsFor, supplementDay, supplementStreak } from "@/lib/supplements";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const today = todayIso();
  const summaries = goalSummaries(today);
  const workouts = getWorkoutsOn(today);
  const recoveryToday = getRecoveryOn(today);
  const recoveryOptions = getActiveRecoveryTypes();
  const unrated = getUnratedWorkouts(today);
  const supplements = supplementDay(today);
  const supplementGroups: SlotGroupView[] = slotGroupsFor(today).map((group) => ({
    slotId: group.slot.id,
    slotName: group.slot.name,
    items: group.items.map((item) => ({
      id: item.supplement.id,
      name: item.supplement.name,
      dose:
        item.supplement.dose === null
          ? null
          : `${Number.isInteger(item.supplement.dose) ? item.supplement.dose : item.supplement.dose.toFixed(1)} ${item.supplement.unit}`,
      taken: item.taken,
    })),
  }));
  const supplementsTaken = supplements.due.filter((s) => supplements.takenIds.has(s.id)).length;
  const supplementStreakDays = supplementStreak(today);

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Today</h1>
            <p className="text-sm text-ink-muted">{fmtIsoDay(today)}</p>
          </div>
          <Link href="/admin" className="text-sm text-ink-muted">
            Admin
          </Link>
        </header>

        <Link href="/log" className="btn-primary w-full text-lg min-h-[64px]">
          Log workout
        </Link>

        {summaries.map((summary) => (
          <GoalCard key={summary.goal.id} summary={summary} />
        ))}

        <section className="card card-pad">
          <h2 className="section-title mb-3">Logged today</h2>
          {workouts.length === 0 && recoveryToday.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing yet.</p>
          ) : (
            <ul className="mb-4 space-y-3">
              {workouts.map((workout) => (
                <WorkoutListItem key={workout.id} workout={workout} />
              ))}
              {recoveryToday
                .filter((r) => r.workoutId === null)
                .map((recovery) => (
                  <li key={recovery.id} className="flex items-start gap-3">
                    <span
                      className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: recovery.color }}
                    />
                    <span className="flex-1">
                      <span className="block font-medium">{recovery.name}</span>
                      <span className="block text-xs text-ink-muted">Recovery only</span>
                    </span>
                  </li>
                ))}
            </ul>
          )}

          <QuickRecovery
            options={recoveryOptions}
            activeIds={recoveryToday.map((r) => r.recoveryTypeId)}
            performedOn={today}
          />
        </section>

        {supplementGroups.length > 0 && (
          <section className="card card-pad">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="section-title">Supplements</h2>
              <span className="text-xs text-ink-muted">
                {supplementsTaken} / {supplements.due.length}
                {supplementStreakDays > 0 && (
                  <>
                    {" "}
                    · {supplementStreakDays} {pluralize(supplementStreakDays, "day")}
                  </>
                )}
              </span>
            </header>
            <SupplementSlots groups={supplementGroups} takenOn={today} />
          </section>
        )}

        {unrated.length > 0 && (
          <section className="card card-pad">
            <h2 className="section-title mb-3">Unrated</h2>
            <ul className="space-y-4">
              {unrated.map((workout) => (
                <li key={workout.id}>
                  <p className="mb-2 text-sm">
                    <span className="font-medium">
                      {workout.subtypeName
                        ? `${workout.typeName} — ${workout.subtypeName}`
                        : workout.typeName}
                    </span>
                    <span className="text-ink-muted">
                      {" "}
                      · {fmtIsoRelative(workout.performedOn, today)}
                    </span>
                  </p>
                  <RatingButtons workoutId={workout.id} value={workout.rating} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <BottomNav />
    </>
  );
}
