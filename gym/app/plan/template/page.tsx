import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import {
  TemplateEditor,
  type TemplateDayValue,
  type TemplateTypeOption,
} from "@/components/TemplateEditor";
import { activeTemplate } from "@/lib/planning";
import { getActiveWorkoutTypes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function TemplatePage() {
  const active = activeTemplate();
  const byDay = new Map((active?.days ?? []).map((day) => [day.dayOfWeek, day]));

  const types: TemplateTypeOption[] = getActiveWorkoutTypes()
    .filter((type) => type.goal !== null)
    .map((type) => ({
      id: type.id,
      name: type.name,
      hasSubtypes: type.hasSubtypes,
      supportsPlanning: type.supportsPlanning,
      subtypes: type.subtypes.map((s) => ({ id: s.id, name: s.name })),
    }));

  const initial: TemplateDayValue[] = Array.from({ length: 7 }, (_, i) => {
    const dayOfWeek = i + 1;
    const existing = byDay.get(dayOfWeek);
    return {
      dayOfWeek,
      workoutTypeId: existing?.workoutTypeId ?? null,
      workoutSubtypeId: existing?.workoutSubtypeId ?? null,
      targetRepsLow: existing?.targetRepsLow ?? 8,
      targetRepsHigh: existing?.targetRepsHigh ?? 12,
      restSeconds: existing?.restSeconds ?? 90,
      exerciseCount: existing?.exerciseCount ?? 5,
    };
  });

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Your week</h1>
            <p className="text-sm text-ink-muted">Set once, fills forward</p>
          </div>
          <Link href="/plan" className="text-sm text-ink-muted">
            Back to plan
          </Link>
        </header>

        <section className="card card-pad">
          <p className="text-sm text-ink-muted">
            Pick what each day is and how you want it to run. Saving fills the next eight weeks of
            calendar, and keeps filling as time passes. Any single day can be changed on the plan
            screen without touching this.
          </p>
        </section>

        {types.length === 0 ? (
          <section className="card card-pad">
            <p className="text-sm text-ink-muted">
              No workout types available yet. Add some in{" "}
              <Link href="/admin/workout-types" className="underline">
                admin
              </Link>
              .
            </p>
          </section>
        ) : (
          <TemplateEditor types={types} initial={initial} />
        )}
      </main>
      <BottomNav />
    </>
  );
}
