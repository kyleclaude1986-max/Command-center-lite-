import Link from "next/link";
import { isElevated } from "@/lib/admin-auth";
import { CSV_TABLES, recordCounts } from "@/lib/export";
import { pluralize } from "@/lib/format";

export const dynamic = "force-dynamic";

const CSV_LABELS: Record<(typeof CSV_TABLES)[number], string> = {
  workouts: "Workouts",
  sets: "Every set",
  body: "Body readings",
  food: "Food diary",
  supplements: "Supplement doses",
};

export default async function AdminRecordsPage() {
  if (!(await isElevated())) return null;

  const counts = recordCounts();

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Records and export</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Everything is in one SQLite file, and everything in it comes back out. The JSON
          export is the complete picture and round-trips; the CSVs are flattened for
          reading in a spreadsheet, with ids swapped for names.
        </p>
      </header>

      <section className="card card-pad">
        <h3 className="section-title mb-3">What is in there</h3>
        <ul className="space-y-1">
          {counts.map((entry) => (
            <li key={entry.label} className="flex items-baseline justify-between text-sm">
              <span>{entry.label}</span>
              <span className="tabular-nums text-ink-muted">
                {entry.count.toLocaleString("en-US")}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Workout and food counts include soft-deleted rows, which stay in the file so a
          delete can be undone and so a month's totals do not shift under you later.
        </p>
      </section>

      <section className="card card-pad">
        <h3 className="section-title mb-3">Download</h3>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/export" className="btn-primary" download>
            Everything as JSON
          </a>
          {CSV_TABLES.map((table) => (
            <a
              key={table}
              href={`/api/admin/export?table=${table}`}
              className="btn-secondary"
              download
            >
              {CSV_LABELS[table]}
            </a>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Photos are referenced by filename rather than embedded — a JSON file with a
          year of images in it is a file nothing will open. They are covered by the
          nightly backup of the photo directory instead.
        </p>
      </section>

      <section className="card card-pad">
        <h3 className="section-title mb-3">Editing what you have logged</h3>
        <p className="text-sm text-ink-muted">
          Records are edited where they live rather than in a table browser here — a
          workout on{" "}
          <Link href="/workouts" className="font-medium">
            its own page
          </Link>
          , food in{" "}
          <Link href="/food" className="font-medium">
            the diary
          </Link>
          , measurements on{" "}
          <Link href="/body" className="font-medium">
            Body
          </Link>
          . Editing a bench press in a grid of foreign keys is how you end up with a set
          attached to the wrong session.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          The definitions behind them — types, goals, exercises, supplements, macro
          targets — are the things this section of admin exists to change.
        </p>
      </section>
    </div>
  );
}
