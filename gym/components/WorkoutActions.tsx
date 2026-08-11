"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DeleteWorkoutButton({ workoutId }: { workoutId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/workouts/${workoutId}`, { method: "DELETE" });
      router.push("/workouts");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <button type="button" className="btn-danger" onClick={remove} disabled={busy || isPending}>
        {busy ? "Deleting" : "Really delete"}
      </button>
      <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
        Keep it
      </button>
    </div>
  );
}

export function DurationEditor({
  workoutId,
  durationSec,
}: {
  workoutId: number;
  durationSec: number | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(durationSec === null ? "" : String(Math.round(durationSec / 60)));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await fetch(`/api/workouts/${workoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: value === "" ? null : Number(value) }),
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        className="field flex-1"
        placeholder="Minutes"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" className="btn-secondary" onClick={save} disabled={busy || isPending}>
        {busy ? "Saving" : "Save"}
      </button>
    </div>
  );
}
