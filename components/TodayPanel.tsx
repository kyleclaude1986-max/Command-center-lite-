import { type DashboardEvent } from "@/lib/queries";
import { calendarColor, fmtTime } from "@/lib/format";
import { RefreshButton } from "./RefreshButton";

export function TodayPanel({ events }: { events: DashboardEvent[] }) {
  return (
    <section className="card card-pad">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="section-title">Today</h2>
        <RefreshButton label="Refresh calendars" />
      </header>
      {events.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing on the calendar today.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3">
              <span className={`mt-1.5 inline-block h-2.5 w-2.5 rounded-full ${calendarColor(e.source, e.calendarLabel)}`} />
              <div className="flex-1">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm tabular-nums text-ink-muted w-20 shrink-0">
                    {e.allDay ? "All day" : fmtTime(e.startsAt)}
                  </span>
                  <span className="font-medium">{e.title}</span>
                </div>
                <div className="pl-[5.25rem] text-xs text-ink-muted">
                  <span>{e.calendarLabel}</span>
                  {e.location && <span> · {e.location}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
