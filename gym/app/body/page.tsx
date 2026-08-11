import { BottomNav } from "@/components/BottomNav";

export const dynamic = "force-dynamic";

export default function BodyPage() {
  return (
    <>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-32 pt-6">
        <header>
          <h1 className="text-2xl font-semibold">Body</h1>
        </header>
        <section className="card card-pad">
          <p className="text-sm text-ink-muted">Body metrics are not wired up yet.</p>
        </section>
      </main>
      <BottomNav />
    </>
  );
}
