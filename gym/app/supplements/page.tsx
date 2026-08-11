import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { MonthCalendar } from "@/components/MonthCalendar";
import { SupplementSlots, type SlotGroupView } from "@/components/SupplementSlots";
import { fmtIsoDay, todayIso } from "@/lib/dates";
import { pluralize } from "@/lib/format";
import {
  activeSupplements,
  slotGroupsFor,
  supplementDay,
  supplementMonth,
  supplementStreak,
} from "@/lib/supplements";

export const dynamic = "force-dynamic";

function doseLabel(dose: number | null, unit: string): string | null {
  if (dose === null) return null;
  const rounded = Number.isInteger(dose) ? String(dose) : dose.toFixed(1);
  return `${rounded} ${unit}`;
}

export default function SupplementsPage() {
  const today = todayIso();
  const day = supplementDay(today);
  const streak = supplementStreak(today);
  const stack = activeSupplements();

  const groups: SlotGroupView[] = slotGroupsFor(today).map((group) => ({
    slotId: group.slot.id,
    slotName: group.slot.name,
    items: group.items.map((item) => ({
      id: item.supplement.id,
      name: item.supplement.name,
      dose: doseLabel(item.supplement.dose, item.supplement.unit),
      taken: item.taken,
    })),
  }));

  const takenCount = day.due.filter((s) => day.takenIds.has(s.id)).length;

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Supplements</h1>
            <p className="text-sm text-ink-muted">{fmtIsoDay(today)}</p>
          </div>
          <Link href="/admin/supplements" className="text-sm text-ink-muted">
            Edit stack
          </Link>
        </header>

        <section className="card card-pad">
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="section-title">Today</h2>
            <span className="text-xs text-ink-muted">
              {streak > 0 ? `${streak} ${pluralize(streak, "day")} running` : "No streak yet"}
            </span>
          </header>

          <div className="mb-4 flex items-baseline gap-2">
            <span className="metric-value tabular-nums">
              {takenCount}
              <span className="text-ink-muted"> / {day.due.length}</span>
            </span>
            {day.status === "hit" && (
              <span className="text-sm font-medium text-state-hit">All taken</span>
            )}
            {day.status === "in_progress" && (
              <span className="text-sm text-ink-muted">Still going</span>
            )}
          </div>

          <SupplementSlots groups={groups} takenOn={today} />
        </section>

        {stack.length > 0 && (
          <section className="card card-pad">
            <h2 className="section-title mb-3">This month</h2>
            <MonthCalendar days={supplementMonth(today, today)} />
          </section>
        )}

        {stack.length === 0 && (
          <section className="card card-pad">
            <p className="text-sm text-ink-muted">
              No supplements yet. Add your stack in{" "}
              <Link href="/admin/supplements" className="underline">
                admin
              </Link>
              .
            </p>
          </section>
        )}
      </main>
      <BottomNav />
    </>
  );
}
