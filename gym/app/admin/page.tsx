import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 pb-16 pt-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <Link href="/" className="text-sm text-ink-muted">
          Back to today
        </Link>
      </header>
      <section className="card card-pad">
        <p className="text-sm text-ink-muted">Admin is not wired up yet.</p>
      </section>
    </main>
  );
}
