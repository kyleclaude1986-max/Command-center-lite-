"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { ExerciseOption, LoggedExercise } from "@/lib/logbook";
import { MUSCLE_GROUP_LABELS } from "@/lib/labels";

type Props = {
  workoutId: number;
  entries: LoggedExercise[];
  options: ExerciseOption[];
  canPrefill: boolean;
};

async function send(url: string, method: string, body?: unknown): Promise<boolean> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok;
}

export function ExerciseLog({ workoutId, entries, options, canPrefill }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const grouped = useMemo(() => {
    const map = new Map<string, ExerciseOption[]>();
    for (const option of options) {
      const label = MUSCLE_GROUP_LABELS[option.muscleGroup] ?? option.muscleGroup;
      const bucket = map.get(label);
      if (bucket) bucket.push(option);
      else map.set(label, [option]);
    }
    return [...map.entries()];
  }, [options]);

  async function run(fn: () => Promise<boolean>, failure: string) {
    setBusy(true);
    setError("");
    try {
      if (!(await fn())) setError(failure);
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || isPending;

  return (
    <section className="card card-pad">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="section-title">Exercises</h2>
        {entries.length > 0 && (
          <span className="text-xs text-ink-muted">
            {entries.length} {entries.length === 1 ? "movement" : "movements"}
          </span>
        )}
      </header>

      {entries.length === 0 && (
        <p className="mb-3 text-sm text-ink-muted">
          Nothing logged yet.
          {canPrefill && " Start from the plan, or add a movement below."}
        </p>
      )}

      {canPrefill && entries.length === 0 && (
        <button
          type="button"
          className="btn-secondary mb-4"
          disabled={disabled}
          onClick={() =>
            run(
              () => send(`/api/workouts/${workoutId}/exercises`, "POST", { fromPlan: true }),
              "Could not copy the plan across."
            )
          }
        >
          Start from the plan
        </button>
      )}

      <ul className="space-y-5">
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{entry.exercise.name}</p>
                {entry.lastTime ? (
                  <p className="text-xs text-ink-muted">
                    Last time:{" "}
                    {entry.lastTime.sets
                      .filter((set) => !set.isWarmup)
                      .map((set) =>
                        set.weightLb === null
                          ? `${set.reps ?? "?"}`
                          : `${set.reps ?? "?"} x ${set.weightLb}`
                      )
                      .join(", ") || "no working sets"}
                  </p>
                ) : (
                  <p className="text-xs text-ink-muted">First time logging this one.</p>
                )}
                {entry.note && <p className="text-xs text-ink-muted">{entry.note}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">
                {index > 0 && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      run(
                        () => send(`/api/workout-exercises/${entry.id}`, "PATCH", { move: "up" }),
                        "Could not reorder."
                      )
                    }
                  >
                    Up
                  </button>
                )}
                {index < entries.length - 1 && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      run(
                        () => send(`/api/workout-exercises/${entry.id}`, "PATCH", { move: "down" }),
                        "Could not reorder."
                      )
                    }
                  >
                    Down
                  </button>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    run(
                      () => send(`/api/workout-exercises/${entry.id}`, "DELETE"),
                      "Could not remove that one."
                    )
                  }
                >
                  Remove
                </button>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="w-8 font-normal">Set</th>
                  <th className="font-normal">Reps</th>
                  <th className="font-normal">Weight</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {entry.sets.map((set, setIndex) => (
                  <tr key={set.id}>
                    <td
                      className={clsx(
                        "py-1 tabular-nums",
                        set.isWarmup ? "text-ink-muted" : "text-ink"
                      )}
                    >
                      {set.isWarmup ? "W" : setIndex + 1 - entry.sets.slice(0, setIndex).filter((s) => s.isWarmup).length}
                    </td>
                    <td className="py-1 pr-2">
                      <SetField
                        value={set.reps}
                        placeholder="reps"
                        step={1}
                        onCommit={(value) =>
                          run(
                            () => send(`/api/sets/${set.id}`, "PATCH", { reps: value }),
                            "Could not save those reps."
                          )
                        }
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <SetField
                        value={set.weightLb}
                        placeholder="lb"
                        step={2.5}
                        onCommit={(value) =>
                          run(
                            () => send(`/api/sets/${set.id}`, "PATCH", { weightLb: value }),
                            "Could not save that weight."
                          )
                        }
                      />
                    </td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        className="text-xs text-ink-muted"
                        disabled={disabled}
                        onClick={() =>
                          run(
                            () => send(`/api/sets/${set.id}`, "DELETE"),
                            "Could not remove that set."
                          )
                        }
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-1 flex gap-4 text-xs text-ink-muted">
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  run(
                    () => send(`/api/workout-exercises/${entry.id}`, "PATCH", { addSet: true }),
                    "Could not add a set."
                  )
                }
              >
                Add set
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  run(
                    () => send(`/api/workout-exercises/${entry.id}`, "PATCH", { addWarmup: true }),
                    "Could not add a warmup."
                  )
                }
              >
                Add warmup
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-line pt-4">
        <label className="block text-xs text-ink-muted" htmlFor="add-exercise">
          Add a movement
        </label>
        <select
          id="add-exercise"
          className="field mt-1"
          value=""
          disabled={disabled}
          onChange={(event) => {
            const exerciseId = Number(event.target.value);
            if (!exerciseId) return;
            run(
              () =>
                send(`/api/workouts/${workoutId}/exercises`, "POST", { exerciseId }),
              "Could not add that movement."
            );
          }}
        >
          <option value="">Pick one</option>
          {grouped.map(([label, items]) => (
            <optgroup key={label} label={label}>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {error && <p className="mt-3 text-sm text-accent-warm">{error}</p>}
    </section>
  );
}

function SetField({
  value,
  placeholder,
  step,
  onCommit,
}: {
  value: number | null;
  placeholder: string;
  step: number;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [dirty, setDirty] = useState(false);

  const committed = value === null ? "" : String(value);
  if (!dirty && draft !== committed) setDraft(committed);

  return (
    <input
      className="field w-full tabular-nums"
      inputMode="decimal"
      type="number"
      step={step}
      min={0}
      placeholder={placeholder}
      value={draft}
      onChange={(event) => {
        setDirty(true);
        setDraft(event.target.value);
      }}
      onBlur={() => {
        if (!dirty) return;
        setDirty(false);
        const trimmed = draft.trim();
        onCommit(trimmed === "" ? null : Number(trimmed));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
