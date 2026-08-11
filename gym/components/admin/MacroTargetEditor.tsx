"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { MACRO_DIRECTIONS, type MacroDirection } from "@/lib/db/schema";

export type TargetScope = {
  scopeKey: number;
  scopeName: string;
  configured: boolean;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  caloriesDirection: MacroDirection;
  proteinDirection: MacroDirection;
  carbsDirection: MacroDirection;
  fatDirection: MacroDirection;
  tolerancePct: number;
};

const FIELDS = [
  { value: "calories", direction: "caloriesDirection", label: "Calories", unit: "" },
  { value: "proteinG", direction: "proteinDirection", label: "Protein", unit: "g" },
  { value: "carbsG", direction: "carbsDirection", label: "Carbs", unit: "g" },
  { value: "fatG", direction: "fatDirection", label: "Fat", unit: "g" },
] as const;

const DIRECTION_LABELS: Record<MacroDirection, string> = {
  at_least: "At least",
  at_most: "At most",
  around: "Around",
};

export function MacroTargetEditor({ scopes }: { scopes: TargetScope[] }) {
  return (
    <div className="space-y-6">
      {scopes.map((scope) => (
        <ScopeCard key={scope.scopeKey} scope={scope} />
      ))}
    </div>
  );
}

function ScopeCard({ scope }: { scope: TargetScope }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState(scope);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isDefault = scope.scopeKey === 0;

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/macro-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeKey: draft.scopeKey,
          calories: draft.calories,
          proteinG: draft.proteinG,
          carbsG: draft.carbsG,
          fatG: draft.fatG,
          caloriesDirection: draft.caloriesDirection,
          proteinDirection: draft.proteinDirection,
          carbsDirection: draft.carbsDirection,
          fatDirection: draft.fatDirection,
          tolerancePct: draft.tolerancePct,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not save that.");
        return;
      }
      setMessage("Saved.");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    try {
      await fetch(`/api/admin/macro-targets?scopeKey=${scope.scopeKey}`, { method: "DELETE" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || isPending;

  return (
    <section className="card card-pad">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-medium">{scope.scopeName}</h3>
          <p className="text-xs text-ink-muted">
            {isDefault
              ? "Used on any day with no workout logged."
              : scope.configured
                ? "Used on days you log this workout."
                : "Following the rest-day default. Save to give this type its own."}
          </p>
        </div>
        {!isDefault && scope.configured && (
          <button
            type="button"
            className="text-xs text-ink-muted"
            disabled={disabled}
            onClick={reset}
          >
            Use the default
          </button>
        )}
      </header>

      <div className="space-y-3">
        {FIELDS.map((field) => (
          <div key={field.value} className="flex flex-wrap items-end gap-3">
            <div className="w-28">
              <label className="field-label" htmlFor={`${scope.scopeKey}-${field.value}`}>
                {field.label} {field.unit && `(${field.unit})`}
              </label>
              <input
                id={`${scope.scopeKey}-${field.value}`}
                type="number"
                inputMode="numeric"
                min="0"
                className="field mt-1 tabular-nums"
                value={draft[field.value]}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, [field.value]: Number(event.target.value) }))
                }
              />
            </div>
            <div className="flex gap-1">
              {MACRO_DIRECTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={draft[field.direction] === option}
                  onClick={() => setDraft((prev) => ({ ...prev, [field.direction]: option }))}
                  className={clsx(
                    "min-h-[40px] rounded-lg border px-3 text-xs font-medium transition-colors",
                    draft[field.direction] === option
                      ? "border-ink bg-ink text-paper"
                      : "border-paper-line bg-paper-card text-ink"
                  )}
                >
                  {DIRECTION_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="w-32">
          <label className="field-label" htmlFor={`${scope.scopeKey}-tolerance`}>
            Tolerance (%)
          </label>
          <input
            id={`${scope.scopeKey}-tolerance`}
            type="number"
            min="0"
            max="50"
            className="field mt-1 tabular-nums"
            value={draft.tolerancePct}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, tolerancePct: Number(event.target.value) }))
            }
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={save} disabled={disabled}>
          {busy ? "Saving" : "Save"}
        </button>
        {message && <span className="text-sm text-state-hit">{message}</span>}
        {error && <span className="text-sm text-accent-warm">{error}</span>}
      </div>
    </section>
  );
}
