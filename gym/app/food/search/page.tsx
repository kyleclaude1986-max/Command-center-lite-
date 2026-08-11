import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { FoodSearch } from "@/components/FoodSearch";
import { isValidIso, todayIso } from "@/lib/dates";
import { isMeal } from "@/lib/food/diary";

export const dynamic = "force-dynamic";

export default async function FoodSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ meal?: string; on?: string }>;
}) {
  const params = await searchParams;
  const today = todayIso();
  const on = params.on && isValidIso(params.on) ? params.on : today;
  const meal = isMeal(params.meal) ? params.meal : "snack";

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header>
          <Link href={`/food?on=${on}`} className="text-sm text-ink-muted">
            Back to the diary
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Add food</h1>
        </header>

        <FoodSearch initialMeal={meal} loggedOn={on} />
      </main>
      <BottomNav />
    </>
  );
}
