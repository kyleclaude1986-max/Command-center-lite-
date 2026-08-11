import Link from "next/link";
import { LogSheet } from "@/components/LogSheet";
import { todayIso } from "@/lib/dates";
import { getActiveRecoveryTypes, getLoggableWorkoutTypes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function LogPage() {
  const types = getLoggableWorkoutTypes();
  const recoveryOptions = getActiveRecoveryTypes();

  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 pt-6">
      <header className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Log a workout</h1>
        <Link href="/" className="text-sm text-ink-muted">
          Cancel
        </Link>
      </header>

      {types.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No workout types yet. Add one in <Link href="/admin/workout-types">admin</Link>.
        </p>
      ) : (
        <LogSheet types={types} recoveryOptions={recoveryOptions} today={todayIso()} />
      )}
    </main>
  );
}
