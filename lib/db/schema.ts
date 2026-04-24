import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const oauthAccounts = sqliteTable("oauth_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  provider: text("provider").notNull(), // 'msgraph'
  accountLabel: text("account_label").notNull(), // 'Work A' / 'Work B'
  externalUserId: text("external_user_id"),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  encryptedAccessToken: text("encrypted_access_token"),
  accessTokenExpiresAt: integer("access_token_expires_at"), // unix seconds
  scope: text("scope"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const calendarEvents = sqliteTable(
  "calendar_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(), // 'msgraph' | 'icloud'
    calendarLabel: text("calendar_label").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    startsAt: integer("starts_at").notNull(), // unix seconds
    endsAt: integer("ends_at").notNull(),
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    location: text("location"),
    url: text("url"),
    lastSyncedAt: integer("last_synced_at").notNull().default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqPerSource: uniqueIndex("calendar_events_source_extid_start_idx").on(
      t.source,
      t.calendarLabel,
      t.externalId,
      t.startsAt,
    ),
    byStartsAt: index("calendar_events_starts_at_idx").on(t.startsAt),
  }),
);

export const bloomTodos = sqliteTable("bloom_todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalId: text("external_id").notNull().unique(),
  title: text("title").notNull(),
  dueAt: integer("due_at"),
  status: text("status").notNull(),
  team: text("team"),
  url: text("url"),
  lastSyncedAt: integer("last_synced_at").notNull().default(sql`(unixepoch())`),
});

export const netsuiteMetrics = sqliteTable("netsuite_metrics", {
  metricKey: text("metric_key").primaryKey(), // 'ytd_gross' | 'mtd_gross' | 'pipeline'
  value: text("value").notNull(), // store as string to preserve decimals
  asOf: integer("as_of").notNull().default(sql`(unixepoch())`),
});

export const syncRuns = sqliteTable(
  "sync_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    startedAt: integer("started_at").notNull().default(sql`(unixepoch())`),
    finishedAt: integer("finished_at"),
    status: text("status").notNull().default("running"), // running | ok | error
    error: text("error"),
    itemsWritten: integer("items_written").default(0),
  },
  (t) => ({
    bySource: index("sync_runs_source_idx").on(t.source, t.startedAt),
  }),
);

export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type BloomTodo = typeof bloomTodos.$inferSelect;
export type NetsuiteMetric = typeof netsuiteMetrics.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
