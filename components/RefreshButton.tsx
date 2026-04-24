"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RefreshButton({ source, label = "Refresh" }: { source?: string; label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const qs = source ? `?source=${encodeURIComponent(source)}` : "";
      await fetch(`/api/sync${qs}`, { method: "POST" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy || isPending}
      className="text-xs text-ink-muted hover:text-ink disabled:opacity-50 underline-offset-2 hover:underline"
    >
      {busy || isPending ? "Refreshing…" : label}
    </button>
  );
}
