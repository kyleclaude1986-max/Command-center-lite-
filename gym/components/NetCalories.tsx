import { fmtCalories } from "@/lib/format";
import type { DayEnergy } from "@/lib/energy";

export function NetCalories({ energy }: { energy: DayEnergy }) {
  if (energy.netKcal === null) {
    return (
      <section className="card card-pad">
        <h2 className="section-title mb-2">Net calories</h2>
        <p className="text-sm text-ink-muted">
          Unavailable — {energy.activeKcal === null && energy.basalKcal === null
            ? "no energy data from your Watch yet today."
            : energy.basalKcal === null
              ? "resting energy has not come through yet."
              : "active energy has not come through yet."}
        </p>
        {energy.hasFood && (
          <p className="mt-1 text-sm">
            <span className="text-ink-muted">Eaten</span>{" "}
            <span className="tabular-nums">{fmtCalories(energy.eatenKcal)}</span>
          </p>
        )}
      </section>
    );
  }

  const surplus = energy.netKcal > 0;

  return (
    <section className="card card-pad">
      <h2 className="section-title mb-2">Net calories</h2>
      <p className="text-2xl font-semibold tabular-nums">
        {surplus ? "+" : ""}
        {fmtCalories(energy.netKcal)}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {fmtCalories(energy.eatenKcal)} eaten − {fmtCalories(energy.activeKcal)} active −{" "}
        {fmtCalories(energy.basalKcal)} resting
      </p>
    </section>
  );
}
