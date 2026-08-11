"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

export function RatingButtons({
  workoutId,
  value,
  size = "md",
}: {
  workoutId: number;
  value: number | null;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState(value);

  async function rate(rating: number) {
    const next = optimistic === rating ? null : rating;
    setOptimistic(next);
    setBusy(true);
    try {
      await fetch(`/api/workouts/${workoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: next }),
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-1.5" role="group" aria-label="Rate this workout">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => rate(n)}
          disabled={busy || isPending}
          aria-pressed={optimistic === n}
          className={clsx(
            "rounded-lg border font-medium tabular-nums transition-colors disabled:opacity-50",
            size === "sm" ? "h-8 w-8 text-sm" : "h-11 flex-1 text-base",
            optimistic !== null && n <= optimistic
              ? "border-accent-warm bg-accent-warm text-paper-card"
              : "border-paper-line bg-paper-card text-ink-muted"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
