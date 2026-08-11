import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { BodyEntryForm } from "@/components/BodyEntryForm";
import { MetricChart } from "@/components/MetricChart";
import { DeleteMetricButton } from "@/components/BodyActions";
import {
  METRIC_KEYS,
  METRIC_LABELS,
  METRIC_UNITS,
  allSeries,
  derivedBodyFatPct,
  latestMetrics,
  recentMetrics,
} from "@/lib/body";
import { fmtIsoDay, todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = {
  weightLb: "#1e6091",
  muscleMassLb: "#4a7c59",
  fatMassLb: "#a4553a",
  bodyFatPct: "#b08968",
};

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default function BodyPage() {
  const today = todayIso();
  const series = allSeries(90, today);
  const latest = latestMetrics();
  const recent = recentMetrics(20);
  const tracked = series.filter((s) => s.points.length > 0);

  const todayEntry = recent.find((row) => row.measuredOn === today) ?? null;
  const existing = todayEntry
    ? Object.fromEntries(
        METRIC_KEYS.map((key) => [key, todayEntry[key] === null ? "" : String(todayEntry[key])])
      )
    : {};

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Body</h1>
            <p className="text-sm text-ink-muted">
              {latest ? `Last measured ${fmtIsoDay(latest.measuredOn)}` : "Nothing measured yet"}
            </p>
          </div>
          <Link href="/photos" className="text-sm text-ink-muted">
            Photos
          </Link>
        </header>

        <section className="card card-pad">
          <h2 className="section-title mb-3">Log a measurement</h2>
          <BodyEntryForm today={today} existing={existing} />
        </section>

        {tracked.length > 0 && (
          <section className="card card-pad">
            <h2 className="section-title mb-1">Last 90 days</h2>
            <div className="space-y-6">
              {tracked.map((entry) => (
                <div key={entry.key}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-sm font-medium">{entry.label}</span>
                    <span className="text-sm tabular-nums text-ink-muted">
                      {entry.latest === null ? "—" : `${round(entry.latest)} ${entry.unit}`}
                      {entry.change !== null && entry.change !== 0 && (
                        <>
                          {" "}
                          <span>
                            ({entry.change > 0 ? "+" : ""}
                            {round(entry.change)})
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <MetricChart series={entry} color={COLORS[entry.key] ?? "#1e6091"} />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              The change is measured against the oldest reading in the window. Day to day,
              body weight moves on water and timing — the direction over months is the part
              that means anything.
            </p>
          </section>
        )}

        {recent.length > 0 && (
          <section className="card card-pad">
            <h2 className="section-title mb-3">Recent readings</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted">
                    <th className="font-normal">Date</th>
                    {METRIC_KEYS.map((key) => (
                      <th key={key} className="pl-3 text-right font-normal">
                        {METRIC_LABELS[key]}
                      </th>
                    ))}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => {
                    const bodyFat = derivedBodyFatPct(row);
                    return (
                      <tr key={row.id} className="border-t border-paper-line">
                        <td className="py-2">{fmtIsoDay(row.measuredOn)}</td>
                        {METRIC_KEYS.map((key) => {
                          const value = key === "bodyFatPct" ? bodyFat : row[key];
                          const inferred = key === "bodyFatPct" && row.bodyFatPct === null && bodyFat !== null;
                          return (
                            <td
                              key={key}
                              className={`py-2 pl-3 text-right tabular-nums ${inferred ? "text-ink-muted" : ""}`}
                              title={inferred ? "Worked out from weight and fat mass" : undefined}
                            >
                              {value === null ? "—" : round(value)}
                            </td>
                          );
                        })}
                        <td className="py-2 text-right">
                          <DeleteMetricButton metricId={row.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Body fat shown in grey was worked out from weight and fat mass, not measured.
              Units are {METRIC_UNITS.weightLb} except body fat, which is a percentage.
            </p>
          </section>
        )}
      </main>
      <BottomNav />
    </>
  );
}
