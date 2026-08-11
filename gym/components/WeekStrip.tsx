import clsx from "clsx";
import type { GoalDay } from "@/lib/goals";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export function WeekStrip({ days }: { days: GoalDay[] }) {
  return (
    <ul className="flex gap-1.5">
      {days.map((day, i) => (
        <li key={day.iso} className="flex flex-1 flex-col items-center gap-1">
          <span
            title={day.iso}
            className={clsx(
              "block h-8 w-full rounded-lg border",
              day.qualified && "border-state-hit bg-state-hit",
              !day.qualified && day.vacation && "border-dashed border-accent-warm bg-paper",
              !day.qualified && !day.vacation && day.future && "border-paper-line bg-paper",
              !day.qualified && !day.vacation && !day.future && "border-paper-line bg-state-idle"
            )}
          />
          <span className="text-[10px] font-medium text-ink-muted">{LETTERS[i]}</span>
        </li>
      ))}
    </ul>
  );
}
