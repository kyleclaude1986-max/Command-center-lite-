import { asc, eq, isNull } from "drizzle-orm";
import { MacroTargetEditor, type TargetScope } from "@/components/admin/MacroTargetEditor";
import { db } from "@/lib/db/client";
import { macroTargets, workoutTypes } from "@/lib/db/schema";
import { isElevated } from "@/lib/admin-auth";
import { REST_DAY_SCOPE, defaultTarget } from "@/lib/macros";
import { APPLE_HEALTH_TYPE_SLUG } from "@/lib/seed-data";

export const dynamic = "force-dynamic";

export default async function AdminMacroTargetsPage() {
  if (!(await isElevated())) return null;

  const fallback = defaultTarget();
  const types = db
    .select()
    .from(workoutTypes)
    .where(isNull(workoutTypes.archivedAt))
    .orderBy(asc(workoutTypes.position))
    .all()
    .filter((type) => type.slug !== APPLE_HEALTH_TYPE_SLUG);

  function scopeFrom(scopeKey: number, scopeName: string): TargetScope {
    const row =
      scopeKey === REST_DAY_SCOPE
        ? fallback
        : (db.select().from(macroTargets).where(eq(macroTargets.scopeKey, scopeKey)).get() ?? null);

    const source = row ?? fallback;

    return {
      scopeKey,
      scopeName,
      configured: row !== null,
      calories: source.calories,
      proteinG: source.proteinG,
      carbsG: source.carbsG,
      fatG: source.fatG,
      caloriesDirection: source.caloriesDirection,
      proteinDirection: source.proteinDirection,
      carbsDirection: source.carbsDirection,
      fatDirection: source.fatDirection,
      tolerancePct: source.tolerancePct,
    };
  }

  const scopes: TargetScope[] = [
    scopeFrom(REST_DAY_SCOPE, "Rest day"),
    ...types.map((type) => scopeFrom(type.id, type.name)),
  ];

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Macro targets</h2>
        <p className="mt-1 text-sm text-ink-muted">
          A leg day and a rest day are not the same eating day, so targets are set per
          workout type. The type of the first workout you log that day picks the target
          — what you actually did, not what was planned, so a skipped session does not
          leave a bulking target in place.
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Tolerance is the band either side of a target that still counts. Landing four
          grams under a 180 g protein floor is not a miss in any sense that matters.
        </p>
      </header>

      <MacroTargetEditor scopes={scopes} />
    </div>
  );
}
