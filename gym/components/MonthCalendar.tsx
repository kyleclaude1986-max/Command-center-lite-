import clsx from "clsx";
import { dayOfWeekIso, fmtIsoDayNumber, fmtIsoMonth } from "@/lib/dates";

export type CalendarDay = {
  iso: string;
  status: "hit" | "missed" | "not_logged" | "nothing_due" | "in_progress";
  future: boolean;
};

const LEGEND: { status: CalendarDay["status"]; label: string; className: string }[] = [
  { status: "hit", label: "Took everything", className: "border-state-hit bg-state-hit" },
  { status: "missed", label: "Missed something", className: "border-state-miss bg-state-miss" },
  { status: "not_logged", label: "Not logged", className: "border-paper-line bg-state-idle" },
];

function cellClass(day: CalendarDay): string {
  if (day.future) return "border-paper-line bg-paper text-ink-muted";
  switch (day.status) {
    case "hit":
      return "border-state-hit bg-state-hit text-paper-card";
    case "missed":
      return "border-state-miss bg-state-miss text-paper-card";
    case "in_progress":
      return "border-accent-warm bg-paper text-ink";
    case "nothing_due":
      return "border-paper-line bg-paper text-ink-muted";
    default:
      return "border-paper-line bg-state-idle text-ink-muted";
  }
}

export function MonthCalendar({ days, title }: { days: CalendarDay[]; title?: string }) {
  if (days.length === 0) return null;

  const leadingBlanks = dayOfWeekIso(days[0].iso) - 1;

  return (
    <div>
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{title ?? fmtIsoMonth(days[0].iso)}</h3>
      </header>

      <div className="grid grid-cols-7 gap-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((letter, i) => (
          <span key={i} className="pb-1 text-center text-[10px] font-medium text-ink-muted">
            {letter}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {days.map((day) => (
          <span
            key={day.iso}
            title={day.iso}
            className={clsx(
              "flex h-8 items-center justify-center rounded-lg border text-[11px] tabular-nums",
              cellClass(day)
            )}
          >
            {fmtIsoDayNumber(day.iso)}
          </span>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {LEGEND.map((entry) => (
          <li key={entry.status} className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className={clsx("inline-block h-2.5 w-2.5 rounded border", entry.className)} />
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
