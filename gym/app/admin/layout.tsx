import Link from "next/link";
import { ElevationGate, LockAdminButton } from "@/components/admin/ElevationGate";
import { isElevated } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/goals", label: "Goals" },
  { href: "/admin/workout-types", label: "Workout types" },
  { href: "/admin/recovery-types", label: "Recovery" },
  { href: "/admin/supplements", label: "Supplements" },
  { href: "/admin/vacations", label: "Vacations" },
  { href: "/admin/exercises", label: "Exercises" },
  { href: "/admin/macro-targets", label: "Macro targets" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const elevated = await isElevated();

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <div className="flex items-center gap-4">
          {elevated && <LockAdminButton />}
          <Link href="/" className="text-sm text-ink-muted hover:text-ink">
            Back to today
          </Link>
        </div>
      </header>

      {!elevated ? (
        <ElevationGate />
      ) : (
        <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
          <nav>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-y-2">
              {SECTIONS.map((section) => (
                <li key={section.href}>
                  <Link href={section.href} className="text-sm text-ink-muted hover:text-ink">
                    {section.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-6">{children}</div>
        </div>
      )}
    </div>
  );
}
