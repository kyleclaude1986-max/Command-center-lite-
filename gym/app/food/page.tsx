import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { FoodDiary, SavedMealButtons, type DiaryGroup } from "@/components/FoodDiary";
import { MacroBars } from "@/components/MacroBars";
import { NetCalories } from "@/components/NetCalories";
import { addDaysIso, fmtIsoRelative, isValidIso, todayIso } from "@/lib/dates";
import { diaryFor, savedMealsList } from "@/lib/food/diary";
import { energyOn } from "@/lib/energy";
import { macroDay, nutritionStreak } from "@/lib/macros";
import { pluralize } from "@/lib/format";

export const dynamic = "force-dynamic";

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<{ on?: string }>;
}) {
  const today = todayIso();
  const requested = (await searchParams).on;
  const on = requested && isValidIso(requested) ? requested : today;

  const diary = diaryFor(on);
  const day = macroDay(on, today);
  const energy = energyOn(on);
  const streak = nutritionStreak(today);
  const saved = savedMealsList();

  const groups: DiaryGroup[] = diary.groups.map((group) => ({
    meal: group.meal,
    label: group.label,
    calories: group.totals.calories,
    rows: group.entries.map(({ entry, food }) => ({
      id: entry.id,
      foodName: food.name,
      brand: food.brand,
      quantity: entry.quantity,
      servingName: food.servingName,
      calories: entry.calories,
      proteinG: entry.proteinG,
      carbsG: entry.carbsG,
      fatG: entry.fatG,
    })),
  }));

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Food</h1>
            <p className="text-sm text-ink-muted">
              {fmtIsoRelative(on, today)} · {day.scopeName} targets
            </p>
          </div>
          <Link href="/food/history" className="text-sm text-ink-muted">
            History
          </Link>
        </header>

        <nav className="flex items-center justify-between text-sm">
          <Link href={`/food?on=${addDaysIso(on, -1)}`} className="text-ink-muted">
            Previous day
          </Link>
          {on !== today && (
            <Link href="/food" className="font-medium">
              Back to today
            </Link>
          )}
          {on < today && (
            <Link href={`/food?on=${addDaysIso(on, 1)}`} className="text-ink-muted">
              Next day
            </Link>
          )}
        </nav>

        <section className="card card-pad">
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="section-title">Macros</h2>
            {streak > 0 && (
              <span className="text-xs text-ink-muted">
                {streak} {pluralize(streak, "day")} on target
              </span>
            )}
          </header>
          <MacroBars day={day} />
          <p className="mt-3 text-xs text-ink-muted">
            Protein is a floor and the rest are ceilings, within {round(day.tolerancePct)}%
            either way. Change any of that per workout type in admin.
          </p>
        </section>

        {(energy.netKcal !== null || energy.hasFood) && <NetCalories energy={energy} />}

        {saved.length > 0 && (
          <section className="card card-pad">
            <h2 className="section-title mb-3">One tap again</h2>
            <SavedMealButtons
              loggedOn={on}
              meals={saved.map((meal) => ({
                id: meal.id,
                name: meal.name,
                label: meal.meal,
                calories: meal.totals.calories,
              }))}
            />
          </section>
        )}

        <FoodDiary groups={groups} loggedOn={on} />

        <Link href={`/food/search?on=${on}`} className="btn-primary w-full">
          Add food
        </Link>
      </main>
      <BottomNav />
    </>
  );
}
