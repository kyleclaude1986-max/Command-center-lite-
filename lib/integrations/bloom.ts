import { db } from "../db/client";
import { bloomTodos } from "../db/schema";
import { env, requireEnv } from "../env";

// Bloom Growth's REST API is at https://app.bloomgrowth.com (Swagger at
// https://app.bloomgrowth.com/docs when authenticated). Path shapes are
// confirmed on first deploy — the wrapper below centralizes the one spot
// that needs adjustment if Bloom changes the path.

type BloomTodo = {
  id: string | number;
  name?: string;
  title?: string;
  dueDate?: string | null;
  due?: string | null;
  complete?: boolean;
  isComplete?: boolean;
  completed?: boolean;
  status?: string;
  teamName?: string;
  team?: { name?: string };
  url?: string;
};

function normalize(raw: BloomTodo): {
  externalId: string;
  title: string;
  dueAt: number | null;
  status: string;
  team: string | null;
  url: string | null;
} {
  const title = raw.name ?? raw.title ?? "(untitled)";
  const dueStr = raw.dueDate ?? raw.due ?? null;
  const dueAt = dueStr ? Math.floor(new Date(dueStr).getTime() / 1000) : null;
  const done = raw.complete ?? raw.isComplete ?? raw.completed ?? raw.status === "Complete";
  const status = done ? "complete" : "incomplete";
  const team = raw.teamName ?? raw.team?.name ?? null;
  return {
    externalId: String(raw.id),
    title,
    dueAt,
    status,
    team,
    url: raw.url ?? null,
  };
}

async function bloomFetch<T>(path: string): Promise<T> {
  const base = env.BLOOM_BASE_URL.replace(/\/$/, "");
  const apiKey = requireEnv("BLOOM_API_KEY");
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Bloom ${res.status} ${path}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export async function fetchTodos(): Promise<BloomTodo[]> {
  const userId = requireEnv("BLOOM_USER_ID");
  // Path shape per Bloom API docs — confirm at first deploy and update here
  // if needed. Known candidates:
  //   /api/v1/users/{id}/todos
  //   /api/v1/todos?userId={id}
  const path = `/api/v1/users/${encodeURIComponent(userId)}/todos?archived=false`;
  const json = await bloomFetch<BloomTodo[] | { items: BloomTodo[] } | { data: BloomTodo[] }>(path);
  if (Array.isArray(json)) return json;
  if ("items" in json && Array.isArray(json.items)) return json.items;
  if ("data" in json && Array.isArray(json.data)) return json.data;
  return [];
}

export async function syncBloomTodos(): Promise<number> {
  const raws = await fetchTodos();
  const now = Math.floor(Date.now() / 1000);

  // Wipe + rewrite — to-do list is small and we want deletions reflected.
  db.delete(bloomTodos).run();

  const open = raws.map(normalize).filter((t) => t.status === "incomplete");
  for (const t of open) {
    db.insert(bloomTodos)
      .values({ ...t, lastSyncedAt: now })
      .onConflictDoNothing()
      .run();
  }
  return open.length;
}
