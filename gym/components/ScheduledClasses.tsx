"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ScheduledView = {
  id: number;
  title: string;
  scheduledOn: string;
  when: string;
  guessedTypeId: number | null;
  guessedTypeName: string | null;
};

export type TypeOption = { id: number; name: string };

export function ScheduledClasses({
  items,
  types,
}: {
  items: ScheduledView[];
  types: TypeOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [error, setError] = useState("");

  async function act(id: number, action: "confirm" | "dismiss") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scheduled/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "confirm" && picked[id] ? { workoutTypeId: picked[id] } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not do that.");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || isPending;

  return (
    <section className="card card-pad">
      <h2 className="section-title mb-1">On your calendar</h2>
      <p className="mb-3 text-xs text-ink-muted">
        Booked, not logged. Confirm the ones you actually made.
      </p>

      <ul className="space-y-4">
        {items.map((item) => {
          const typeId = picked[item.id] ?? item.guessedTypeId ?? types[0]?.id ?? 0;
          return (
            <li key={item.id}>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-ink-muted">{item.when}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className="field w-auto flex-1"
                  value={typeId}
                  disabled={disabled}
                  onChange={(event) =>
                    setPicked((prev) => ({ ...prev, [item.id]: Number(event.target.value) }))
                  }
                >
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={disabled}
                  onClick={() => act(item.id, "confirm")}
                >
                  I went
                </button>
                <button
                  type="button"
                  className="text-sm text-ink-muted"
                  disabled={disabled}
                  onClick={() => act(item.id, "dismiss")}
                >
                  Skipped it
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-3 text-sm text-accent-warm">{error}</p>}
    </section>
  );
}
