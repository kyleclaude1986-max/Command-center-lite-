"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { RecoveryType } from "@/lib/db/schema";

export function QuickRecovery({
  options,
  activeIds,
  performedOn,
}: {
  options: RecoveryType[];
  activeIds: number[];
  performedOn: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(activeIds);

  async function toggle(recoveryTypeId: number) {
    const on = !active.includes(recoveryTypeId);
    setActive((prev) => (on ? [...prev, recoveryTypeId] : prev.filter((x) => x !== recoveryTypeId)));
    setBusy(true);
    try {
      await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryTypeId, performedOn, on }),
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = active.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => toggle(option.id)}
            disabled={busy || isPending}
            aria-pressed={on}
            className={clsx(
              "inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors disabled:opacity-50",
              on
                ? "border-accent-warm bg-accent-warm text-paper-card"
                : "border-paper-line bg-paper-card text-ink"
            )}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: on ? "#ffffff" : option.color }}
            />
            {option.name}
          </button>
        );
      })}
    </div>
  );
}
