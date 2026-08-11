"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { PHOTO_POSES, type PhotoPose } from "@/lib/db/schema";
import { POSE_LABELS } from "@/lib/labels";

export function PhotoUpload({ today }: { today: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [takenOn, setTakenOn] = useState(today);
  const [pose, setPose] = useState<PhotoPose>("front");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("takenOn", takenOn);
      form.append("pose", pose);

      const res = await fetch("/api/photos", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not save that photo.");
        return;
      }
      if (input.current) input.current.value = "";
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label" htmlFor="photo-date">
            Date
          </label>
          <input
            id="photo-date"
            type="date"
            className="field mt-1"
            value={takenOn}
            max={today}
            onChange={(event) => setTakenOn(event.target.value)}
          />
        </div>
        <div>
          <span className="field-label">Pose</span>
          <div className="mt-1 flex gap-2">
            {PHOTO_POSES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={pose === option}
                onClick={() => setPose(option)}
                className={clsx(
                  "min-h-[44px] flex-1 rounded-lg border text-sm font-medium transition-colors",
                  pose === option
                    ? "border-ink bg-ink text-paper"
                    : "border-paper-line bg-paper-card text-ink"
                )}
              >
                {POSE_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        capture="environment"
        className="field"
        disabled={busy || isPending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <p className="text-xs text-ink-muted">
        Photos are encrypted on disk and only readable while you are signed in.
      </p>

      {busy && <p className="text-sm text-ink-muted">Saving...</p>}
      {error && <p className="text-sm text-accent-warm">{error}</p>}
    </div>
  );
}

export function DeletePhotoButton({ photoId }: { photoId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/photos/${photoId}`, { method: "DELETE" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="text-xs text-ink-muted"
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        type="button"
        className="text-accent-warm"
        disabled={busy || isPending}
        onClick={remove}
      >
        Really delete
      </button>
      <button type="button" className="text-ink-muted" onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  );
}
