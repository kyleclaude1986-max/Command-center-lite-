"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CalendarSettings({
  configured,
  workoutCalendarName,
  available,
  scanned,
  discoveryError,
  pendingPush,
  lastRun,
}: {
  configured: boolean;
  workoutCalendarName: string;
  available: string[];
  scanned: string[];
  discoveryError: string | null;
  pendingPush: number;
  lastRun: { status: string; error: string | null; finishedAt: number | null } | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>(scanned);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sync(payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Sync failed.");
        return;
      }
      const written = body.push?.written ?? 0;
      const failed = body.push?.failed ?? 0;
      const created = body.scan?.created ?? 0;
      setMessage(
        `${written} pushed, ${created} class${created === 1 ? "" : "es"} found` +
          (failed > 0 ? `, ${failed} failed` : "")
      );
      if (Array.isArray(body.errors) && body.errors.length > 0) setError(body.errors.join("; "));
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || isPending;

  if (!configured) {
    return (
      <section className="card card-pad">
        <h3 className="font-medium">iCloud is not connected</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Set ICLOUD_USERNAME and ICLOUD_APP_PASSWORD in the environment, then restart.
          The password has to be an app-specific one from appleid.apple.com, not your
          Apple ID password.
        </p>
      </section>
    );
  }

  return (
    <section className="card card-pad space-y-4">
      <div>
        <h3 className="font-medium">Workouts calendar</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Everything you log is written to the calendar named{" "}
          <span className="font-medium">{workoutCalendarName}</span>. Create it in the
          Calendar app if it does not exist yet — this app will not make it for you,
          because a calendar created over CalDAV often will not show on the phone.
        </p>
        {pendingPush > 0 && (
          <p className="mt-1 text-sm text-accent-warm">
            {pendingPush} workout{pendingPush === 1 ? "" : "s"} waiting to be pushed.
          </p>
        )}
        {lastRun && (
          <p className="mt-1 text-xs text-ink-muted">
            Last run: {lastRun.status}
            {lastRun.error ? ` — ${lastRun.error}` : ""}
          </p>
        )}
      </div>

      <div>
        <h3 className="font-medium">Calendars to scan for classes</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Classes you book show up here as a one-tap confirmation on the day. Nothing is
          logged automatically — a booked class is not an attended one.
        </p>

        {discoveryError ? (
          <p className="mt-2 text-sm text-accent-warm">{discoveryError}</p>
        ) : available.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No calendars found on that Apple ID.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {available.map((name) => (
              <li key={name}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(name)}
                    disabled={disabled}
                    onChange={(event) =>
                      setSelected((prev) =>
                        event.target.checked
                          ? [...prev, name]
                          : prev.filter((n) => n !== name)
                      )
                    }
                  />
                  {name}
                  {name === workoutCalendarName && (
                    <span className="text-xs text-ink-muted">(the one we write to)</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={disabled}
          onClick={() => sync({ scannedCalendars: selected })}
        >
          {busy ? "Syncing" : "Save and sync now"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled}
          onClick={() => sync({ resyncAll: true })}
        >
          Push everything again
        </button>
      </div>

      {message && <p className="text-sm text-state-hit">{message}</p>}
      {error && <p className="text-sm text-accent-warm">{error}</p>}
    </section>
  );
}
