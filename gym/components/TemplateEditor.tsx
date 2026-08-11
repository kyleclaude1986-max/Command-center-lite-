"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type TemplateTypeOption = {
  id: number;
  name: string;
  hasSubtypes: boolean;
  supportsPlanning: boolean;
  subtypes: { id: number; name: string }[];
};

export type TemplateDayValue = {
  dayOfWeek: number;
  workoutTypeId: number | null;
  workoutSubtypeId: number | null;
  targetRepsLow: number;
  targetRepsHigh: number;
  restSeconds: number;
  exerciseCount: number;
};

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function TemplateEditor({
  types,
  initial,
}: {
  types: TemplateTypeOption[];
  initial: TemplateDayValue[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [days, setDays] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  function update(dayOfWeek: number, patch: Partial<TemplateDayValue>) {
    setDays((prev) =>
      prev.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day))
    );
  }

  function pickType(dayOfWeek: number, rawValue: string) {
    if (rawValue === "") {
      update(dayOfWeek, { workoutTypeId: null, workoutSubtypeId: null });
      return;
    }
    const id = Number(rawValue);
    const type = types.find((t) => t.id === id);
    update(dayOfWeek, {
      workoutTypeId: id,
      workoutSubtypeId: type?.hasSubtypes ? (type.subtypes[0]?.id ?? null) : null,
    });
  }

  async function save() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch("/api/plans/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not save that.");
        return;
      }
      setNote(
        body.created === 0 && body.updated === 0
          ? "Saved. Calendar already up to date."
          : `Saved. ${body.created} sessions added, ${body.updated} updated.`
      );
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {days.map((day) => {
        const type = types.find((t) => t.id === day.workoutTypeId) ?? null;
        return (
          <section key={day.dayOfWeek} className="card card-pad">
            <header className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-medium">{DAY_NAMES[day.dayOfWeek - 1]}</h2>
              <select
                className="field max-w-[14rem]"
                value={day.workoutTypeId === null ? "" : String(day.workoutTypeId)}
                onChange={(e) => pickType(day.dayOfWeek, e.target.value)}
              >
                <option value="">Rest</option>
                {types.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </header>

            {type && (
              <div className="space-y-3">
                {type.hasSubtypes && (
                  <label className="block">
                    <span className="field-label">Which day</span>
                    <select
                      className="field"
                      value={day.workoutSubtypeId === null ? "" : String(day.workoutSubtypeId)}
                      onChange={(e) =>
                        update(day.dayOfWeek, {
                          workoutSubtypeId: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    >
                      {type.subtypes.map((subtype) => (
                        <option key={subtype.id} value={subtype.id}>
                          {subtype.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="block">
                    <span className="field-label">Reps from</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className="field"
                      value={day.targetRepsLow}
                      onChange={(e) =>
                        update(day.dayOfWeek, { targetRepsLow: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Reps to</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className="field"
                      value={day.targetRepsHigh}
                      onChange={(e) =>
                        update(day.dayOfWeek, { targetRepsHigh: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Rest (sec)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={15}
                      className="field"
                      value={day.restSeconds}
                      onChange={(e) =>
                        update(day.dayOfWeek, { restSeconds: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Exercises</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      className="field"
                      value={day.exerciseCount}
                      onChange={(e) =>
                        update(day.dayOfWeek, { exerciseCount: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>

                {!type.supportsPlanning && (
                  <p className="text-xs text-ink-muted">
                    {type.name} isn&apos;t set up for generated workouts, so this day gets a
                    calendar entry but no exercise list. Turn planning on for it in admin if you
                    program these yourself.
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}

      {error && <p className="text-sm text-state-miss">{error}</p>}
      {note && <p className="text-sm text-state-hit">{note}</p>}

      <button type="button" className="btn-primary w-full" onClick={save} disabled={busy || isPending}>
        {busy ? "Saving" : "Save week and fill calendar"}
      </button>
    </div>
  );
}
