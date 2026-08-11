"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { MEALS, type Meal } from "@/lib/db/schema";
import { MEAL_LABELS } from "@/lib/food/labels";

type Result = {
  key: string;
  source: string;
  sourceId: string;
  foodId: number | null;
  name: string;
  brand: string | null;
  servingName: string;
  servingGrams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
};

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function perServing(result: Result, quantity: number) {
  const factor = (quantity * result.servingGrams) / 100;
  return {
    calories: Math.round(result.caloriesPer100g * factor),
    proteinG: Math.round(result.proteinPer100g * factor * 10) / 10,
    carbsG: Math.round(result.carbsPer100g * factor * 10) / 10,
    fatG: Math.round(result.fatPer100g * factor * 10) / 10,
  };
}

export function FoodSearch({ initialMeal, loggedOn }: { initialMeal: Meal; loggedOn: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [recent, setRecent] = useState(true);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Result | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async (params: string) => {
    const mine = ++requestId.current;
    setSearching(true);
    setError("");
    try {
      const res = await fetch(`/api/food/search?${params}`);
      const body = await res.json().catch(() => ({}));
      if (mine !== requestId.current) return;
      if (!res.ok) {
        setError(body.error ?? "Search failed.");
        return;
      }
      setResults(body.results ?? []);
      setRecent(body.recent === true);
      if (body.notFound) setError("No product with that barcode. Try searching by name.");
    } finally {
      if (mine === requestId.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === "") {
      void load("");
      return;
    }
    if (trimmed.length < 2) return;

    const timer = setTimeout(() => {
      void load(new URLSearchParams({ q: trimmed }).toString());
    }, 350);
    return () => clearTimeout(timer);
  }, [query, load]);

  async function logIt() {
    if (!selected) return;
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("How much?");
      return;
    }

    setError("");
    const res = await fetch("/api/food/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loggedOn,
        meal,
        quantity: amount,
        ...(selected.foodId !== null
          ? { foodId: selected.foodId }
          : {
              source: selected.source,
              sourceId: selected.sourceId,
              name: selected.name,
              brand: selected.brand,
              servingName: selected.servingName,
              servingGrams: selected.servingGrams,
              caloriesPer100g: selected.caloriesPer100g,
              proteinPer100g: selected.proteinPer100g,
              carbsPer100g: selected.carbsPer100g,
              fatPer100g: selected.fatPer100g,
            }),
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not log that.");
      return;
    }

    startTransition(() => {
      router.push(`/food?on=${loggedOn}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {MEALS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={meal === option}
            onClick={() => setMeal(option)}
            className={clsx(
              "min-h-[44px] flex-1 rounded-lg border text-sm font-medium transition-colors",
              meal === option
                ? "border-ink bg-ink text-paper"
                : "border-paper-line bg-paper-card text-ink"
            )}
          >
            {MEAL_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="field flex-1"
          placeholder="Search for a food"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        <button type="button" className="btn-secondary" onClick={() => setScanning((s) => !s)}>
          {scanning ? "Stop" : "Scan"}
        </button>
      </div>

      {scanning && (
        <BarcodeScanner
          onCode={(code) => {
            setScanning(false);
            setQuery("");
            void load(new URLSearchParams({ barcode: code }).toString());
          }}
          onError={(message) => {
            setScanning(false);
            setError(message);
          }}
        />
      )}

      {selected && (
        <section className="card card-pad">
          <p className="font-medium">{selected.name}</p>
          {selected.brand && <p className="text-xs text-ink-muted">{selected.brand}</p>}
          <div className="mt-3 flex items-end gap-3">
            <div className="w-24">
              <label className="field-label" htmlFor="quantity">
                Servings
              </label>
              <input
                id="quantity"
                type="number"
                inputMode="decimal"
                step="0.25"
                min="0"
                className="field mt-1 tabular-nums"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <p className="flex-1 pb-2 text-xs text-ink-muted">
              {selected.servingName}
              {selected.servingGrams !== 100 && ` (${round(selected.servingGrams)} g)`}
            </p>
          </div>

          {(() => {
            const amount = Number(quantity);
            const macros = perServing(selected, Number.isFinite(amount) && amount > 0 ? amount : 0);
            return (
              <p className="mt-2 text-sm tabular-nums">
                {macros.calories} kcal · {macros.proteinG}p {macros.carbsG}c {macros.fatG}f
              </p>
            );
          })()}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={isPending}
              onClick={logIt}
            >
              Add to {MEAL_LABELS[meal].toLowerCase()}
            </button>
            <button
              type="button"
              className="text-sm text-ink-muted"
              onClick={() => setSelected(null)}
            >
              Back
            </button>
          </div>
        </section>
      )}

      {!selected && (
        <section className="card card-pad">
          <h2 className="section-title mb-3">
            {recent ? "Recently logged" : searching ? "Searching" : "Results"}
          </h2>

          {results.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {searching ? "Looking..." : "Nothing found. Try fewer words."}
            </p>
          ) : (
            <ul className="divide-y divide-paper-line">
              {results.map((result) => (
                <li key={result.key}>
                  <button
                    type="button"
                    className="flex w-full items-baseline gap-3 py-2 text-left"
                    onClick={() => {
                      setSelected(result);
                      setQuantity("1");
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{result.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {result.brand ? `${result.brand} · ` : ""}
                        {result.servingName} · {result.source.toUpperCase()}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-ink-muted">
                      {Math.round((result.caloriesPer100g * result.servingGrams) / 100)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error && <p className="text-sm text-accent-warm">{error}</p>}
    </div>
  );
}

function BarcodeScanner({
  onCode,
  onError,
}: {
  onCode: (code: string) => void;
  onError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const video = videoRef.current;
        if (!video) return;

        const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (result && !cancelled) {
            cancelled = true;
            onCode(result.getText());
          }
        });

        stop = () => controls.stop();
        if (cancelled) controls.stop();
      } catch {
        if (!cancelled) onError("Could not open the camera. Search by name instead.");
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [onCode, onError]);

  return (
    <div className="card overflow-hidden">
      <video ref={videoRef} className="w-full" muted playsInline />
      <p className="card-pad text-xs text-ink-muted">
        Point it at the barcode. Nothing is uploaded — the code is read on the phone.
      </p>
    </div>
  );
}
