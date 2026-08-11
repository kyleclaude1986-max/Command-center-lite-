import { fmtDuration, pluralize } from "@/lib/format";
import type { GoalSummary } from "@/lib/goals";
import { WeekStrip } from "./WeekStrip";

export function GoalCard({ summary }: { summary: GoalSummary }) {
  const { goal, qualifiedCount, adjustedTarget, target, vacationDays, streakWeeks, met } = summary;
  const reduced = adjustedTarget !== target;

  return (
    <section className="card card-pad">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="section-title">{goal.name}</h2>
        <span className="text-xs text-ink-muted">
          {streakWeeks > 0
            ? `${streakWeeks} ${pluralize(streakWeeks, "week")} running`
            : "No streak yet"}
        </span>
      </header>

      <div className="mb-3 flex items-baseline gap-2">
        <span className="metric-value tabular-nums">
          {qualifiedCount}
          <span className="text-ink-muted"> / {adjustedTarget}</span>
        </span>
        {met && <span className="text-sm font-medium text-state-hit">Hit</span>}
      </div>

      <WeekStrip days={summary.days} />

      <p className="mt-3 text-xs text-ink-muted">
        {reduced ? (
          <>
            Target {target} reduced to {adjustedTarget} · {vacationDays}{" "}
            {pluralize(vacationDays, "vacation day")}
          </>
        ) : goal.minDurationSec ? (
          <>Needs {fmtDuration(goal.minDurationSec)} to count</>
        ) : (
          <>{target} days a week</>
        )}
      </p>
    </section>
  );
}
