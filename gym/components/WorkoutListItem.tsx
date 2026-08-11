import Link from "next/link";
import { fmtDuration, fmtRating } from "@/lib/format";
import { fmtIsoRelative } from "@/lib/dates";
import type { WorkoutRow } from "@/lib/queries";

export function WorkoutListItem({
  workout,
  showDate = false,
}: {
  workout: WorkoutRow;
  showDate?: boolean;
}) {
  const title = workout.subtypeName
    ? `${workout.typeName} — ${workout.subtypeName}`
    : workout.typeName;

  return (
    <li>
      <Link href={`/workouts/${workout.id}`} className="flex items-start gap-3 py-1">
        <span
          className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: workout.typeColor }}
        />
        <span className="flex-1">
          <span className="block font-medium">{title}</span>
          <span className="block text-xs text-ink-muted">
            {showDate && <>{fmtIsoRelative(workout.performedOn)} · </>}
            {fmtDuration(workout.durationSec)}
            {workout.rating !== null && <> · {fmtRating(workout.rating)}</>}
            {workout.provisional && (
              <span className="text-accent-warm">
                {" "}
                · Needs {Math.round((workout.goalMinDurationSec ?? 0) / 60)} min to count
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}
