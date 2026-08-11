import Link from "next/link";
import clsx from "clsx";
import { BottomNav } from "@/components/BottomNav";
import { GenerateButton, MaterializeButton, SkipPlanButton } from "@/components/PlanActions";
import { addDaysIso, fmtIsoDay, fmtIsoRelative, todayIso, weekStartIso } from "@/lib/dates";
import { fmtRest, pluralize } from "@/lib/format";
import { activeTemplate, planDetail, plansInRange } from "@/lib/planning";

export const dynamic = "force-dynamic";

export default function PlanPage() {
  const today = todayIso();
  const from = weekStartIso(today);
  const to = addDaysIso(from, 13);
  const plans = plansInRange(from, to);
  const template = activeTemplate();
  const configured = (template?.days ?? []).filter((d) => d.workoutTypeId !== null).length;

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Plan</h1>
            <p className="text-sm text-ink-muted">Next two weeks</p>
          </div>
          <Link href="/plan/template" className="text-sm text-ink-muted">
            Edit week
          </Link>
        </header>

        {configured === 0 ? (
          <section className="card card-pad">
            <h2 className="text-lg font-semibold">Set your week first</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Pick what each day is — back, chest, legs — along with the rep range, rest, and how
              many exercises you want. The calendar fills forward from that, so planning months
              ahead is one screen rather than ninety.
            </p>
            <Link href="/plan/template" className="btn-primary mt-4 inline-flex">
              Set the week
            </Link>
          </section>
        ) : (
          <section className="card card-pad">
            <header className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="section-title">Calendar</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  {configured} {pluralize(configured, "day")} a week planned
                </p>
              </div>
              <MaterializeButton />
            </header>
            <p className="text-xs text-ink-muted">
              Sessions build the night before, or whenever you tap. Building late is deliberate —
              it means the workout is based on what you actually lifted most recently.
            </p>
          </section>
        )}

        {plans.length === 0 && configured > 0 && (
          <section className="card card-pad">
            <p className="text-sm text-ink-muted">
              Nothing on the calendar yet. Tap Fill calendar above.
            </p>
          </section>
        )}

        {plans.map((row) => {
          const detail = row.exerciseCountGenerated > 0 ? planDetail(row.plan.id) : null;
          const title = row.subtype ? `${row.type.name} — ${row.subtype.name}` : row.type.name;
          const isToday = row.plan.plannedOn === today;
          const past = row.plan.plannedOn < today;

          return (
            <section
              key={row.plan.id}
              className={clsx("card card-pad", isToday && "border-ink", past && "opacity-70")}
            >
              <header className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-muted">
                    {fmtIsoRelative(row.plan.plannedOn, today)} · {fmtIsoDay(row.plan.plannedOn)}
                  </p>
                  <h2 className="mt-0.5 flex items-center gap-2 font-medium">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.type.color }}
                    />
                    {title}
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    {row.plan.exerciseCount} exercises · {row.plan.targetRepsLow}-
                    {row.plan.targetRepsHigh} reps · {fmtRest(row.plan.restSeconds)} rest
                    {row.plan.isOverride && " · edited"}
                  </p>
                </div>
                {row.type.supportsPlanning && row.plan.status !== "completed" && (
                  <GenerateButton
                    planId={row.plan.id}
                    hasExercises={row.exerciseCountGenerated > 0}
                  />
                )}
              </header>

              {row.plan.status === "completed" && (
                <p className="text-sm text-state-hit">Done.</p>
              )}

              {row.plan.status === "skipped" && (
                <p className="text-sm text-ink-muted">Skipped.</p>
              )}

              {detail && detail.exercises.length > 0 && (
                <ol className="space-y-2">
                  {detail.exercises.map((entry, index) => {
                    const working = entry.sets.filter((s) => !s.isWarmup);
                    const weights = working
                      .map((s) => s.targetWeightLb)
                      .filter((w): w is number => w !== null);
                    const target = weights.length > 0 ? `${Math.max(...weights)} lb` : "—";
                    return (
                      <li key={entry.planExerciseId} className="flex items-baseline gap-3 text-sm">
                        <span className="w-4 shrink-0 tabular-nums text-ink-muted">
                          {index + 1}
                        </span>
                        <span className="flex-1">
                          <span className="font-medium">{entry.exercise.name}</span>
                          {entry.note && (
                            <span className="block text-xs text-ink-muted">{entry.note}</span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-ink-muted">
                          {working.length} x {working[0]?.targetReps ?? "?"}
                        </span>
                        <span className="w-16 shrink-0 text-right tabular-nums text-ink-muted">
                          {target}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {!detail && row.plan.status === "scheduled" && (
                <p className="text-sm text-ink-muted">
                  {row.type.supportsPlanning
                    ? "Not built yet."
                    : "Logged on the day — this type isn't planned."}
                </p>
              )}

              <footer className="mt-3 flex items-center justify-between">
                {row.plan.status !== "completed" ? (
                  <SkipPlanButton planId={row.plan.id} skipped={row.plan.status === "skipped"} />
                ) : (
                  <span />
                )}
                {isToday && row.plan.status !== "completed" && (
                  <Link href="/log" className="text-sm font-medium">
                    Log it
                  </Link>
                )}
              </footer>
            </section>
          );
        })}
      </main>
      <BottomNav />
    </>
  );
}
