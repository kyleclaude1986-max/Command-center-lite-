import clsx from "clsx";
import type { MacroDay, MacroVerdict } from "@/lib/macros";

const BAR: Record<MacroVerdict, string> = {
  hit: "bg-state-hit",
  over: "bg-state-miss",
  under: "bg-state-miss",
  pending: "bg-accent-stone",
};

const NOTE: Record<MacroVerdict, string> = {
  hit: "text-state-hit",
  over: "text-state-miss",
  under: "text-state-miss",
  pending: "text-ink-muted",
};

function round(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(1);
}

function verdictNote(verdict: MacroVerdict, direction: string, remaining: number, unit: string) {
  if (verdict === "hit") return "on target";
  if (verdict === "over") return `${round(Math.abs(remaining))}${unit} over`;
  if (verdict === "under") return `${round(Math.abs(remaining))}${unit} short`;
  return direction === "at_least"
    ? `${round(Math.abs(remaining))}${unit} to go`
    : `${round(Math.abs(remaining))}${unit} left`;
}

export function MacroBars({ day }: { day: MacroDay }) {
  return (
    <div className="space-y-3">
      {day.lines.map((line) => {
        const remaining = line.target - line.eaten;
        return (
          <div key={line.key}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{line.label}</span>
              <span className="tabular-nums text-ink-muted">
                {round(line.eaten)}
                {line.unit} / {round(line.target)}
                {line.unit}
                <span className={clsx("ml-2", NOTE[line.verdict])}>
                  {verdictNote(line.verdict, line.direction, remaining, line.unit)}
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-state-idle">
              <div
                className={clsx("h-full rounded-full transition-all", BAR[line.verdict])}
                style={{ width: `${Math.max(2, line.progressPct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
