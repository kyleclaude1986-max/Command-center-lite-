import { addDays, isSameDay, startOfDay, startOfWeek } from "date-fns";
import { type DashboardEvent } from "@/lib/queries";
import { calendarColor, fmtDayLabel, fmtTime } from "@/lib/format";

export function WeekPanel({ events, now = new Date() }: { events: DashboardEvent[]; now?: Date }) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = startOfDay(now);

  return (
    <section className="card card-pad">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="section-title">This week</h2>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map((d) => {
          const dayStart = Math.floor(startOfDay(d).getTime() / 1000);
          const dayEnd = dayStart + 86400;
          const dayEvents = events.filter((e) => e.endsAt > dayStart && e.startsAt < dayEnd);
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={`rounded-xl border px-3 py-2 min-h-28 ${
                isToday ? "border-ink bg-paper" : "border-paper-line"
              }`}
            >
              <div className={`text-xs mb-2 ${isToday ? "font-semibold text-ink" : "text-ink-muted"}`}>
                {fmtDayLabel(d)}
              </div>
              <ul className="space-y-1.5">
                {dayEvents.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex items-start gap-1.5 text-xs">
                    <span
                      className={`mt-1 inline-block h-1.5 w-1.5 rounded-full shrink-0 ${calendarColor(
                        e.source,
                        e.calendarLabel,
                      )}`}
                    />
                    <span className="tabular-nums text-ink-muted">
                      {e.allDay ? "·" : fmtTime(e.startsAt).replace(":00", "")}
                    </span>
                    <span className="truncate">{e.title}</span>
                  </li>
                ))}
                {dayEvents.length > 5 && (
                  <li className="text-xs text-ink-muted">+{dayEvents.length - 5} more</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
