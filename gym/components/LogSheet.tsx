"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { RecoveryType } from "@/lib/db/schema";
import type { WorkoutTypeWithSubtypes } from "@/lib/queries";

export function LogSheet({
  types,
  recoveryOptions,
  today,
}: {
  types: WorkoutTypeWithSubtypes[];
  recoveryOptions: RecoveryType[];
  today: string;
}) {
  const router = useRouter();
  const [typeId, setTypeId] = useState<number | null>(null);
  const [subtypeId, setSubtypeId] = useState<number | null>(null);
  const [performedOn, setPerformedOn] = useState(today);
  const [durationMinutes, setDurationMinutes] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [recovery, setRecovery] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(() => types.find((t) => t.id === typeId) ?? null, [types, typeId]);
  const minDuration = selected?.goal?.minDurationSec ?? null;
  const needsDuration = minDuration !== null;
  const minMinutes = minDuration === null ? null : Math.round(minDuration / 60);
  const enteredMinutes = Number(durationMinutes);
  const shortOfTarget =
    needsDuration &&
    durationMinutes !== "" &&
    Number.isFinite(enteredMinutes) &&
    minMinutes !== null &&
    enteredMinutes < minMinutes;

  const canSave = typeId !== null && (!selected?.hasSubtypes || subtypeId !== null);

  function pickType(id: number) {
    setTypeId(id);
    setSubtypeId(null);
  }

  function toggleRecovery(id: number) {
    setRecovery((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutTypeId: typeId,
          workoutSubtypeId: subtypeId,
          performedOn,
          durationMinutes: durationMinutes === "" ? null : Number(durationMinutes),
          rating,
          notes: notes || null,
          recoveryTypeIds: recovery,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not save that.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="card card-pad">
        <h2 className="section-title mb-3">What did you do</h2>
        <div className="grid grid-cols-1 gap-2">
          {types.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => pickType(type.id)}
              aria-pressed={typeId === type.id}
              className={clsx(
                "flex min-h-[56px] items-center gap-3 rounded-xl border px-4 text-left font-medium transition-colors",
                typeId === type.id
                  ? "border-ink bg-ink text-paper"
                  : "border-paper-line bg-paper-card text-ink"
              )}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: type.color }}
              />
              <span className="flex-1">{type.name}</span>
              {type.goal && (
                <span
                  className={clsx(
                    "text-xs",
                    typeId === type.id ? "text-paper/70" : "text-ink-muted"
                  )}
                >
                  {type.goal.name}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {selected?.hasSubtypes && (
        <section className="card card-pad">
          <h2 className="section-title mb-3">Which day</h2>
          <div className="grid grid-cols-2 gap-2">
            {selected.subtypes.map((subtype) => (
              <button
                key={subtype.id}
                type="button"
                onClick={() => setSubtypeId(subtype.id)}
                aria-pressed={subtypeId === subtype.id}
                className={clsx(
                  "min-h-[52px] rounded-xl border px-3 font-medium transition-colors",
                  subtypeId === subtype.id
                    ? "border-ink bg-ink text-paper"
                    : "border-paper-line bg-paper-card text-ink"
                )}
              >
                {subtype.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {recoveryOptions.length > 0 && (
        <section className="card card-pad">
          <h2 className="section-title mb-3">Recovery</h2>
          <div className="grid grid-cols-2 gap-2">
            {recoveryOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => toggleRecovery(option.id)}
                aria-pressed={recovery.includes(option.id)}
                className={clsx(
                  "flex min-h-[52px] items-center gap-2 rounded-xl border px-3 font-medium transition-colors",
                  recovery.includes(option.id)
                    ? "border-accent-warm bg-accent-warm text-paper-card"
                    : "border-paper-line bg-paper-card text-ink"
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: recovery.includes(option.id) ? "#ffffff" : option.color,
                  }}
                />
                {option.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card card-pad space-y-4">
        <div>
          <label htmlFor="performedOn" className="field-label">
            Date
          </label>
          <input
            id="performedOn"
            type="date"
            className="field"
            value={performedOn}
            max={today}
            onChange={(e) => setPerformedOn(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="duration" className="field-label">
            Duration in minutes {needsDuration ? "" : "(optional)"}
          </label>
          <input
            id="duration"
            type="number"
            inputMode="numeric"
            min={0}
            className="field"
            placeholder={needsDuration ? `${minMinutes} to count` : "Comes from your Watch"}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          />
          {needsDuration && durationMinutes === "" && (
            <p className="mt-1.5 text-xs text-ink-muted">
              {selected?.goal?.name} needs {minMinutes} minutes to count. Leave it blank and it will
              fill in from your Watch.
            </p>
          )}
          {shortOfTarget && (
            <p className="mt-1.5 text-xs text-accent-warm">
              Under {minMinutes} minutes, so this will not count toward {selected?.goal?.name}.
            </p>
          )}
        </div>

        <div>
          <span className="field-label">How was it (optional)</span>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(rating === n ? null : n)}
                aria-pressed={rating === n}
                className={clsx(
                  "h-11 flex-1 rounded-lg border font-medium tabular-nums transition-colors",
                  rating !== null && n <= rating
                    ? "border-accent-warm bg-accent-warm text-paper-card"
                    : "border-paper-line bg-paper-card text-ink-muted"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="field-label">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            rows={2}
            className="field py-2"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </section>

      {error && <p className="text-sm text-state-miss">{error}</p>}

      <button type="button" className="btn-primary w-full" onClick={save} disabled={!canSave || saving}>
        {saving ? "Saving" : "Log it"}
      </button>
    </div>
  );
}
