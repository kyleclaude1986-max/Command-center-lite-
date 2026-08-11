import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { WorkoutListItem } from "@/components/WorkoutListItem";
import { fmtAverage, pluralize } from "@/lib/format";
import {
  getRatingAveragesBySubtype,
  getRatingAveragesByType,
  getRecentWorkouts,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function WorkoutsPage() {
  const workouts = getRecentWorkouts(60);
  const byType = getRatingAveragesByType();
  const bySubtype = getRatingAveragesBySubtype();

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Workouts</h1>
          <Link href="/log" className="text-sm text-ink-muted">
            Log one
          </Link>
        </header>

        {byType.length > 0 && (
          <section className="card card-pad">
            <h2 className="section-title mb-3">Average rating by type</h2>
            <ul className="space-y-2">
              {byType.map((row) => (
                <li key={row.label} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="flex-1 text-sm">{row.label}</span>
                  <span className="text-sm font-medium tabular-nums">
                    {fmtAverage(row.average)}
                  </span>
                  <span className="w-24 text-right text-xs text-ink-muted">
                    {row.ratedCount} rated
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {bySubtype.length > 0 && (
          <section className="card card-pad">
            <h2 className="section-title mb-3">Average rating by day</h2>
            <ul className="space-y-2">
              {bySubtype.map((row) => (
                <li key={row.label} className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="flex-1 text-sm">{row.label}</span>
                  <span className="text-sm font-medium tabular-nums">
                    {fmtAverage(row.average)}
                  </span>
                  <span className="w-24 text-right text-xs text-ink-muted">
                    {row.ratedCount} rated
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card card-pad">
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="section-title">History</h2>
            <span className="text-xs text-ink-muted">
              {workouts.length} {pluralize(workouts.length, "workout")}
            </span>
          </header>
          {workouts.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing logged yet.</p>
          ) : (
            <ul className="space-y-3">
              {workouts.map((workout) => (
                <WorkoutListItem key={workout.id} workout={workout} showDate />
              ))}
            </ul>
          )}
        </section>
      </main>
      <BottomNav />
    </>
  );
}
