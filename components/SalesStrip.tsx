import { fmtCurrency, fmtRelative } from "@/lib/format";
import { RefreshButton } from "./RefreshButton";

export function SalesStrip({
  ytd,
  mtd,
  pipeline,
  asOf,
}: {
  ytd: number | null;
  mtd: number | null;
  pipeline: number | null;
  asOf: number | null;
}) {
  const tile = (label: string, value: number | null) => (
    <div className="card card-pad flex-1">
      <div className="section-title">{label}</div>
      <div className="metric-value mt-1 tabular-nums">{fmtCurrency(value)}</div>
    </div>
  );

  return (
    <section>
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="section-title">Z Design · Sales</h2>
        <div className="text-xs text-ink-muted flex items-center gap-3">
          <span>Updated {fmtRelative(asOf)}</span>
          <RefreshButton source="netsuite" />
        </div>
      </header>
      <div className="flex flex-col md:flex-row gap-3">
        {tile("Gross sales · YTD", ytd)}
        {tile("Gross sales · Month", mtd)}
        {tile("Pipeline (open estimates)", pipeline)}
      </div>
    </section>
  );
}
