"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { SWATCHES } from "@/lib/swatches";

export type AdminFieldOption = { value: string; label: string };

export type AdminField =
  | { key: string; label: string; type: "text" | "number" | "date"; placeholder?: string; hint?: string }
  | { key: string; label: string; type: "select"; options: AdminFieldOption[]; hint?: string }
  | { key: string; label: string; type: "color"; hint?: string }
  | { key: string; label: string; type: "checkbox"; hint?: string };

export type AdminItem = {
  id: number;
  label: string;
  sublabel?: string;
  color?: string;
  archived?: boolean;
  deleteImpact?: string;
  values: Record<string, string | number | boolean | null>;
};

function emptyDraft(fields: AdminField[]): Record<string, string | boolean> {
  const draft: Record<string, string | boolean> = {};
  for (const field of fields) {
    draft[field.key] = field.type === "checkbox" ? false : "";
  }
  return draft;
}

function draftFrom(item: AdminItem, fields: AdminField[]): Record<string, string | boolean> {
  const draft: Record<string, string | boolean> = {};
  for (const field of fields) {
    const value = item.values[field.key];
    draft[field.key] =
      field.type === "checkbox" ? Boolean(value) : value === null || value === undefined ? "" : String(value);
  }
  return draft;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: AdminField;
  value: string | boolean;
  onChange: (next: string | boolean) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4"
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block">
        <span className="field-label">{field.label}</span>
        <select className="field" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "color") {
    return (
      <div>
        <span className="field-label">{field.label}</span>
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              title={swatch.name}
              aria-label={swatch.name}
              aria-pressed={value === swatch.hex}
              onClick={() => onChange(swatch.hex)}
              className={clsx(
                "h-9 w-9 rounded-lg border-2 transition-transform",
                value === swatch.hex ? "border-ink scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: swatch.hex }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="field-label">{field.label}</span>
      <input
        type={field.type}
        inputMode={field.type === "number" ? "numeric" : undefined}
        className="field"
        placeholder={field.placeholder}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.hint && <span className="mt-1 block text-xs text-ink-muted">{field.hint}</span>}
    </label>
  );
}

export function AdminList({
  entity,
  title,
  description,
  fields,
  items,
  addLabel = "Add",
  canArchive = true,
  canDelete = true,
}: {
  entity: string;
  title: string;
  description?: string;
  fields: AdminField[];
  items: AdminItem[];
  addLabel?: string;
  canArchive?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | boolean>>(emptyDraft(fields));

  function setField(key: string, value: string | boolean) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function send(method: string, url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? "That did not work.");
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (await send("POST", `/api/admin/${entity}`, draft)) {
      setDraft(emptyDraft(fields));
      setAdding(false);
    }
  }

  async function update(id: number) {
    if (await send("PATCH", `/api/admin/${entity}`, { ...draft, id })) {
      setEditingId(null);
    }
  }

  async function archive(id: number, on: boolean) {
    await send("DELETE", `/api/admin/${entity}?id=${id}&mode=${on ? "archive" : "unarchive"}`);
  }

  async function destroy(id: number) {
    if (await send("DELETE", `/api/admin/${entity}?id=${id}&mode=delete`)) {
      setConfirmingId(null);
    }
  }

  function startEdit(item: AdminItem) {
    setEditingId(item.id);
    setConfirmingId(null);
    setDraft(draftFrom(item, fields));
  }

  const disabled = busy || isPending;

  return (
    <section className="card card-pad">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={() => {
            setAdding((v) => !v);
            setEditingId(null);
            setDraft(emptyDraft(fields));
          }}
        >
          {adding ? "Cancel" : addLabel}
        </button>
      </header>

      {adding && (
        <div className="mb-5 space-y-3 rounded-xl border border-paper-line bg-paper p-4">
          {fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={draft[field.key] ?? ""}
              onChange={(next) => setField(field.key, next)}
            />
          ))}
          <button type="button" className="btn-primary" onClick={create} disabled={disabled}>
            {busy ? "Saving" : "Save"}
          </button>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-state-miss">{error}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-paper-line">
          {items.map((item) => (
            <li key={item.id} className="py-3">
              <div className="flex items-center gap-3">
                {item.color && (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className={clsx("font-medium", item.archived && "text-ink-muted line-through")}>
                    {item.label}
                  </p>
                  {item.sublabel && <p className="text-xs text-ink-muted">{item.sublabel}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="text-sm text-ink-muted hover:text-ink"
                    onClick={() => (editingId === item.id ? setEditingId(null) : startEdit(item))}
                  >
                    {editingId === item.id ? "Close" : "Edit"}
                  </button>
                  {canArchive && (
                    <button
                      type="button"
                      className="text-sm text-ink-muted hover:text-ink"
                      onClick={() => archive(item.id, !item.archived)}
                      disabled={disabled}
                    >
                      {item.archived ? "Restore" : "Archive"}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="text-sm text-state-miss hover:underline"
                      onClick={() =>
                        setConfirmingId(confirmingId === item.id ? null : item.id)
                      }
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {confirmingId === item.id && (
                <div className="mt-3 rounded-xl border border-state-miss/40 bg-paper p-3">
                  <p className="mb-3 text-sm">
                    Delete <span className="font-medium">{item.label}</span> for good?
                    {item.deleteImpact && <> {item.deleteImpact}</>}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => destroy(item.id)}
                      disabled={disabled}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setConfirmingId(null)}
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              )}

              {editingId === item.id && (
                <div className="mt-3 space-y-3 rounded-xl border border-paper-line bg-paper p-4">
                  {fields.map((field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={draft[field.key] ?? ""}
                      onChange={(next) => setField(field.key, next)}
                    />
                  ))}
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => update(item.id)}
                    disabled={disabled}
                  >
                    {busy ? "Saving" : "Save"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
