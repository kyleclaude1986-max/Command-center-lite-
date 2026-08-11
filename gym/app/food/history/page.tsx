import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { MonthCalendar, type CalendarDay, type LegendEntry } from "@/components/MonthCalendar";
import { addDaysIso, fmtIsoMonth, isValidIso, todayIso } from "@/lib/dates";
import { hitRates, macroMonth, nutritionStreak } from "@/lib/macros";
import { pluralize } from "@/lib/format";

export const dynamic = "force-dynamic";

const LEGEND: LegendEntry[] = [
  { status: "hit", label: "All four landed", className: "border-state-hit bg-state-hit" },
  { status: "missed", label: "Missed one", className: "border-state-miss bg-state-miss" },
  { status: "not_logged", label: "Nothing logged", className: "border-paper-line bg-state-idle" },
];

export default async function FoodHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const today = todayIso();
  const requested = (await searchParams).month;
  const anchor =
    requested && /^\d{4}-\d{2}$/.test(requested) && isValidIso(`${requested}-01`)
      ? `${requested}-01`
      : `${today.slice(0, 7)}-01`;

  const month = macroMonth(anchor, today);
  const days: CalendarDay[] = month.map((day) => ({
    iso: day.iso,
    status: day.status,
    future: day.iso > today,
  }));

  const first = month[0]!.iso;
  const last = month[month.length - 1]!.iso;
  const rates = hitRates(first, last > today ? today : last, today);
  const streak = nutritionStreak(today);
  const loggedDays = month.filter((d) => d.status !== "not_logged" && d.iso <= today).length;

  const previous = addDaysIso(first, -1).slice(0, 7);
  const next = addDaysIso(last, 1).slice(0, 7);
  const hasNext = `${next}-01` <= today;

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Nutrition history</h1>
            <p className="text-sm text-ink-muted">
              {streak > 0
                ? `${streak} ${pluralize(streak, "day")} on target`
                : "No streak yet"}
            </p>
          </div>
          <Link href="/food" className="text-sm text-ink-muted">
            Today
          </Link>
        </header>

        <section className="card card-pad">
          <nav className="mb-4 flex items-center justify-between text-sm">
            <Link href={`/food/history?month=${previous}`} className="text-ink-muted">
              Previous
            </Link>
            <span className="font-medium">{fmtIsoMonth(first)}</span>
            {hasNext ? (
              <Link href={`/food/history?month=${next}`} className="text-ink-muted">
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>

          <MonthCalendar days={days} title=" " legend={LEGEND} />
        </section>

        <section className="card card-pad">
          <h2 className="section-title mb-3">Where it goes wrong</h2>
          {loggedDays === 0 ? (
            <p className="text-sm text-ink-muted">Nothing logged this month yet.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {rates.map((rate) => {
                  const pct = rate.days === 0 ? 0 : Math.round((rate.hits / rate.days) * 100);
                  return (
                    <li key={rate.key} className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{rate.label}</span>
                      <span className="tabular-nums text-ink-muted">
                        {rate.hits} / {rate.days} {pluralize(rate.days, "day")} · {pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-ink-muted">
                Counted across the {loggedDays} {pluralize(loggedDays, "day")} you logged
                food this month. A day you did not track is not a day you missed.
              </p>
            </>
          )}
        </section>
      </main>
      <BottomNav />
    </>
  );
}
