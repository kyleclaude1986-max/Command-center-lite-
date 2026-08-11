"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Meal } from "@/lib/db/schema";

export type DiaryRow = {
  id: number;
  foodName: string;
  brand: string | null;
  quantity: number;
  servingName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type DiaryGroup = {
  meal: Meal;
  label: string;
  rows: DiaryRow[];
  calories: number;
};

function round(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(1);
}

export function FoodDiary({ groups, loggedOn }: { groups: DiaryGroup[]; loggedOn: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [savingMeal, setSavingMeal] = useState<Meal | null>(null);
  const [mealName, setMealName] = useState("");
  const [error, setError] = useState("");

  async function run(fn: () => Promise<Response>, failure: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fn();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? failure);
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || isPending;

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.meal} className="card card-pad">
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="section-title">{group.label}</h2>
            <span className="text-xs tabular-nums text-ink-muted">
              {group.rows.length === 0 ? "—" : `${round(group.calories)} kcal`}
            </span>
          </header>

          {group.rows.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing yet.</p>
          ) : (
            <ul className="space-y-2">
              {group.rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{row.foodName}</span>
                    <span className="block text-xs text-ink-muted">
                      {row.brand ? `${row.brand} · ` : ""}
                      {round(row.quantity)} x {row.servingName} · {round(row.proteinG)}p{" "}
                      {round(row.carbsG)}c {round(row.fatG)}f
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-muted">
                    {round(row.calories)}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-ink-muted"
                    disabled={disabled}
                    onClick={() =>
                      run(
                        () => fetch(`/api/food/log/${row.id}`, { method: "DELETE" }),
                        "Could not remove that."
                      )
                    }
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-4 text-sm">
            <Link
              href={`/food/search?meal=${group.meal}&on=${loggedOn}`}
              className="font-medium"
            >
              Add
            </Link>
            {group.rows.length > 0 && savingMeal !== group.meal && (
              <button
                type="button"
                className="text-xs text-ink-muted"
                onClick={() => {
                  setSavingMeal(group.meal);
                  setMealName("");
                }}
              >
                Save as a meal
              </button>
            )}
          </div>

          {savingMeal === group.meal && (
            <div className="mt-3 flex gap-2">
              <input
                className="field flex-1"
                placeholder="Name it — eggs and oats"
                value={mealName}
                onChange={(event) => setMealName(event.target.value)}
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={disabled || mealName.trim() === ""}
                onClick={async () => {
                  const saved = await run(
                    () =>
                      fetch("/api/food/meals", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: mealName.trim(),
                          loggedOn,
                          meal: group.meal,
                        }),
                      }),
                    "Could not save that meal."
                  );
                  if (saved) setSavingMeal(null);
                }}
              >
                Save
              </button>
              <button
                type="button"
                className="text-sm text-ink-muted"
                onClick={() => setSavingMeal(null)}
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      ))}

      {error && <p className="text-sm text-accent-warm">{error}</p>}
    </div>
  );
}

export function SavedMealButtons({
  meals,
  loggedOn,
}: {
  meals: { id: number; name: string; label: string; calories: number }[];
  loggedOn: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  if (meals.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {meals.map((meal) => (
        <button
          key={meal.id}
          type="button"
          className="btn-secondary"
          disabled={busy || isPending}
          onClick={async () => {
            setBusy(true);
            try {
              await fetch("/api/food/log", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ savedMealId: meal.id, loggedOn }),
              });
              startTransition(() => router.refresh());
            } finally {
              setBusy(false);
            }
          }}
        >
          {meal.name}
          <span className="ml-2 text-xs text-ink-muted">{Math.round(meal.calories)}</span>
        </button>
      ))}
    </div>
  );
}
