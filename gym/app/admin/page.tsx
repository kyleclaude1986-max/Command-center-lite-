import Link from "next/link";
import { isElevated } from "@/lib/admin-auth";
import {
  exerciseItems,
  goalItems,
  recoveryTypeItems,
  vacationItems,
  workoutTypeItems,
} from "@/lib/admin-queries";
import { pluralize } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isElevated())) return null;

  const sections = [
    {
      href: "/admin/goals",
      label: "Goals",
      count: goalItems().filter((g) => !g.archived).length,
      noun: "goal",
      blurb: "Weekly targets, minimum durations, and what earns a streak.",
    },
    {
      href: "/admin/workout-types",
      label: "Workout types",
      count: workoutTypeItems().filter((t) => !t.archived).length,
      noun: "type",
      blurb: "The buttons on the log sheet, their colours, and their sub-days.",
    },
    {
      href: "/admin/recovery-types",
      label: "Recovery",
      count: recoveryTypeItems().filter((r) => !r.archived).length,
      noun: "type",
      blurb: "Sauna, red light, and anything else worth tracking.",
    },
    {
      href: "/admin/vacations",
      label: "Vacations",
      count: vacationItems().length,
      noun: "trip",
      blurb: "Date ranges that scale a week's targets down.",
    },
    {
      href: "/admin/exercises",
      label: "Exercises",
      count: exerciseItems().filter((e) => !e.archived).length,
      noun: "exercise",
      blurb: "The library the strength log picks from.",
    },
  ];

  return (
    <>
      <section className="card card-pad">
        <h2 className="text-lg font-semibold">Everything here is yours to change</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Goals, workout types, and thresholds are data rather than code, so nothing on this page
          needs a deploy. Archiving is the safe move and keeps your history readable. Deleting is
          blocked whenever something is still using the record.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="card card-pad hover:border-ink">
            <div className="flex items-baseline justify-between">
              <h3 className="font-medium">{section.label}</h3>
              <span className="text-xs text-ink-muted tabular-nums">
                {section.count} {pluralize(section.count, section.noun)}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">{section.blurb}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
