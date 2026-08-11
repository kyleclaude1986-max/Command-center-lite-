import { BottomNav } from "@/components/BottomNav";
import { fmtIsoDay, todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default function FoodPage() {
  const today = todayIso();

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header>
          <h1 className="text-2xl font-semibold">Food</h1>
          <p className="text-sm text-ink-muted">{fmtIsoDay(today)}</p>
        </header>
        <section className="card card-pad">
          <p className="text-sm text-ink-muted">Food tracking is not wired up yet.</p>
        </section>
      </main>
      <BottomNav />
    </>
  );
}
