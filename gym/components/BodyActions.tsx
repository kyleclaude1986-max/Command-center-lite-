"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DeleteMetricButton({ metricId }: { metricId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/body?id=${metricId}`, { method: "DELETE" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" className="text-xs text-ink-muted" onClick={() => setConfirming(true)}>
        &times;
      </button>
    );
  }

  return (
    <button
      type="button"
      className="text-xs text-accent-warm"
      disabled={busy || isPending}
      onClick={remove}
    >
      Sure?
    </button>
  );
}
