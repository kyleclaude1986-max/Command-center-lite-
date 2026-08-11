"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { METRIC_KEYS, METRIC_LABELS, METRIC_UNITS, type MetricKey } from "@/lib/labels";

type Draft = Record<MetricKey, string>;

const EMPTY: Draft = { weightLb: "", muscleMassLb: "", fatMassLb: "", bodyFatPct: "" };

export function BodyEntryForm({ today, existing }: { today: string; existing: Partial<Draft> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [measuredOn, setMeasuredOn] = useState(today);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, ...existing });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const hasSomething = METRIC_KEYS.some((key) => draft[key].trim() !== "");

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload: Record<string, unknown> = { measuredOn };
      for (const key of METRIC_KEYS) {
        const value = draft[key].trim();
        if (value !== "") payload[key] = Number(value);
      }

      const res = await fetch("/api/body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? "Could not save that.");
        return;
      }

      setMessage(body.created ? "Saved." : "Updated that day.");
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || isPending;

  return (
    <div className="space-y-3">
      <div>
        <label className="field-label" htmlFor="measured-on">
          Date
        </label>
        <input
          id="measured-on"
          type="date"
          className="field mt-1"
          value={measuredOn}
          max={today}
          onChange={(event) => setMeasuredOn(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {METRIC_KEYS.map((key) => (
          <div key={key}>
            <label className="field-label" htmlFor={`metric-${key}`}>
              {METRIC_LABELS[key]} ({METRIC_UNITS[key]})
            </label>
            <input
              id={`metric-${key}`}
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              className="field mt-1 tabular-nums"
              value={draft[key]}
              onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn-primary w-full"
        onClick={save}
        disabled={disabled || !hasSomething}
      >
        {saving ? "Saving" : "Save"}
      </button>

      <p className="text-xs text-ink-muted">
        Leave anything blank and it stays as it was. Two readings on one day means the
        second replaced the first.
      </p>

      {message && <p className="text-sm text-state-hit">{message}</p>}
      {error && <p className="text-sm text-accent-warm">{error}</p>}
    </div>
  );
}
