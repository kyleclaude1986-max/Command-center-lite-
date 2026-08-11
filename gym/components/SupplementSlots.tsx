"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

export type SlotGroupView = {
  slotId: number;
  slotName: string;
  items: { id: number; name: string; dose: string | null; taken: boolean }[];
};

export function SupplementSlots({
  groups,
  takenOn,
}: {
  groups: SlotGroupView[];
  takenOn: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState<Set<number>>(
    () => new Set(groups.flatMap((g) => g.items.filter((i) => i.taken).map((i) => i.id)))
  );

  async function send(payload: Record<string, unknown>, optimistic: () => void) {
    optimistic();
    setBusy(true);
    try {
      await fetch("/api/supplements/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takenOn, ...payload }),
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  function toggleOne(id: number) {
    const on = !taken.has(id);
    send({ supplementId: id, on }, () =>
      setTaken((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      })
    );
  }

  function toggleSlot(group: SlotGroupView) {
    const on = group.items.some((item) => !taken.has(item.id));
    send({ slotId: group.slotId, on }, () =>
      setTaken((prev) => {
        const next = new Set(prev);
        for (const item of group.items) {
          if (on) next.add(item.id);
          else next.delete(item.id);
        }
        return next;
      })
    );
  }

  if (groups.length === 0) {
    return <p className="text-sm text-ink-muted">Nothing due today.</p>;
  }

  const disabled = busy || isPending;

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const allTaken = group.items.every((item) => taken.has(item.id));
        return (
          <div key={group.slotId}>
            <header className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-medium">{group.slotName}</h3>
              <button
                type="button"
                className="text-xs text-ink-muted hover:text-ink"
                onClick={() => toggleSlot(group)}
                disabled={disabled}
              >
                {allTaken ? "Undo all" : "Took all"}
              </button>
            </header>
            <ul className="space-y-1.5">
              {group.items.map((item) => {
                const on = taken.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggleOne(item.id)}
                      disabled={disabled}
                      aria-pressed={on}
                      className={clsx(
                        "flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors disabled:opacity-50",
                        on
                          ? "border-state-hit bg-state-hit/10 text-ink"
                          : "border-paper-line bg-paper-card text-ink"
                      )}
                    >
                      <span
                        className={clsx(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                          on ? "border-state-hit bg-state-hit" : "border-paper-line"
                        )}
                      >
                        {on && (
                          <svg
                            viewBox="0 0 16 16"
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 8.5l3.5 3.5L13 4" className="text-paper-card" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 text-sm font-medium">{item.name}</span>
                      {item.dose && (
                        <span className="text-xs tabular-nums text-ink-muted">{item.dose}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
