"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ElevationGate() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/elevate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? "Incorrect password.");
        return;
      }
      setPassword("");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad max-w-sm">
      <h2 className="text-lg font-semibold">Confirm it is you</h2>
      <p className="mb-4 mt-1 text-sm text-ink-muted">
        Admin can change goals and remove records, so it asks for your password again. It stays
        unlocked for two hours.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="admin-password" className="field-label">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-state-miss">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy || isPending}>
          {busy ? "Checking" : "Unlock admin"}
        </button>
      </form>
    </div>
  );
}

export function LockAdminButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function lock() {
    await fetch("/api/admin/elevate", { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      className="text-sm text-ink-muted hover:text-ink"
      onClick={lock}
      disabled={isPending}
    >
      Lock admin
    </button>
  );
}
