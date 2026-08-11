import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { RatingButtons } from "@/components/RatingButtons";
import { DeleteWorkoutButton, DurationEditor } from "@/components/WorkoutActions";
import { fmtIsoDay } from "@/lib/dates";
import { fmtCalories, fmtDuration } from "@/lib/format";
import { getRecoveryOn, getWorkout } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const workout = getWorkout(id);
  if (!workout) notFound();

  const recovery = getRecoveryOn(workout.performedOn).filter((r) => r.workoutId === workout.id);
  const title = workout.subtypeName
    ? `${workout.typeName} — ${workout.subtypeName}`
    : workout.typeName;

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header>
          <Link href="/workouts" className="text-sm text-ink-muted">
            Back to workouts
          </Link>
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold">
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: workout.typeColor }}
            />
            {title}
          </h1>
          <p className="text-sm text-ink-muted">{fmtIsoDay(workout.performedOn)}</p>
        </header>

        <section className="card card-pad">
          <h2 className="section-title mb-3">Duration</h2>
          <DurationEditor workoutId={workout.id} durationSec={workout.durationSec} />
          <p className="mt-2 text-xs text-ink-muted">
            {workout.durationSource === "apple_health"
              ? "From your Apple Watch."
              : "Fills in from your Watch if you leave it blank."}
            {workout.provisional && workout.goalMinDurationSec !== null && (
              <span className="text-accent-warm">
                {" "}
                Needs {fmtDuration(workout.goalMinDurationSec)} to count toward{" "}
                {workout.goalName}.
              </span>
            )}
          </p>
        </section>

        <section className="card card-pad">
          <h2 className="section-title mb-3">How was it</h2>
          <RatingButtons workoutId={workout.id} value={workout.rating} />
        </section>

        {(workout.caloriesKcal !== null || recovery.length > 0 || workout.notes) && (
          <section className="card card-pad space-y-3">
            {workout.caloriesKcal !== null && (
              <p className="text-sm">
                <span className="text-ink-muted">Calories</span>{" "}
                <span className="tabular-nums">{fmtCalories(workout.caloriesKcal)}</span>
              </p>
            )}
            {recovery.length > 0 && (
              <p className="text-sm">
                <span className="text-ink-muted">Recovery</span>{" "}
                {recovery.map((r) => r.name).join(" · ")}
              </p>
            )}
            {workout.notes && <p className="text-sm">{workout.notes}</p>}
          </section>
        )}

        <DeleteWorkoutButton workoutId={workout.id} />
      </main>
      <BottomNav />
    </>
  );
}
