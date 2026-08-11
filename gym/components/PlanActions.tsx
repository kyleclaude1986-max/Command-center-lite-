"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function GenerateButton({
  planId,
  hasExercises,
  label,
}: {
  planId: number;
  hasExercises: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function generate() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/plans/${planId}/generate`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(body.error ?? "Could not build that one.");
        return;
      }
      if (body.source === "fallback") {
        setNote(
          body.error
            ? `Built without AI — ${body.error}`
            : "Built without AI. Add an API key for smarter sessions."
        );
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary"
        onClick={generate}
        disabled={busy || isPending}
      >
        {busy ? "Building" : (label ?? (hasExercises ? "Rebuild" : "Build it"))}
      </button>
      {note && <span className="text-right text-xs text-accent-warm">{note}</span>}
    </div>
  );
}

export function MaterializeButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function run() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/plans/materialize", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setNote(
          body.created === 0 && body.updated === 0
            ? "Already up to date"
            : `${body.created} added, ${body.updated} updated`
        );
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {note && <span className="text-xs text-ink-muted">{note}</span>}
      <button type="button" className="btn-secondary" onClick={run} disabled={busy || isPending}>
        {busy ? "Filling" : "Fill calendar"}
      </button>
    </div>
  );
}

export function SkipPlanButton({ planId, skipped }: { planId: number; skipped: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch(`/api/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: skipped ? "scheduled" : "skipped" }),
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="text-sm text-ink-muted hover:text-ink"
      onClick={toggle}
      disabled={busy || isPending}
    >
      {skipped ? "Unskip" : "Skip"}
    </button>
  );
}
