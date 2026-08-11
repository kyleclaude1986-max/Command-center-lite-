import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { RatingButtons } from "@/components/RatingButtons";
import { DeleteWorkoutButton, DurationEditor } from "@/components/WorkoutActions";
import { ExerciseLog } from "@/components/ExerciseLog";
import { fmtIsoDay } from "@/lib/dates";
import { fmtCalories, fmtDuration } from "@/lib/format";
import { exerciseOptions, workoutLog, workoutVolume } from "@/lib/logbook";
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

  const log = workout.isStrength ? workoutLog(workout.id) : [];
  const volume = workout.isStrength ? workoutVolume(workout.id) : null;

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

        {workout.isStrength && (
          <ExerciseLog
            workoutId={workout.id}
            entries={log}
            options={exerciseOptions()}
            canPrefill={workout.planId !== null}
          />
        )}

        {volume !== null && volume.sets > 0 && (
          <section className="card card-pad">
            <h2 className="section-title mb-3">Working volume</h2>
            <p className="text-sm">
              <span className="tabular-nums">{volume.sets}</span> sets ·{" "}
              <span className="tabular-nums">{volume.reps}</span> reps ·{" "}
              <span className="tabular-nums">{fmtCalories(volume.volumeLb)}</span> lb moved
            </p>
            <p className="mt-1 text-xs text-ink-muted">Warmups excluded.</p>
          </section>
        )}

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
