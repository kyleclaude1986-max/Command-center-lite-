CREATE TABLE `bloom_todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`due_at` integer,
	`status` text NOT NULL,
	`team` text,
	`url` text,
	`last_synced_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bloom_todos_external_id_unique` ON `bloom_todos` (`external_id`);--> statement-breakpoint
CREATE TABLE `calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`calendar_label` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`location` text,
	`url` text,
	`last_synced_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_source_extid_start_idx` ON `calendar_events` (`source`,`calendar_label`,`external_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `calendar_events_starts_at_idx` ON `calendar_events` (`starts_at`);--> statement-breakpoint
CREATE TABLE `netsuite_metrics` (
	`metric_key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`as_of` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`account_label` text NOT NULL,
	`external_user_id` text,
	`encrypted_refresh_token` text NOT NULL,
	`encrypted_access_token` text,
	`access_token_expires_at` integer,
	`scope` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`error` text,
	`items_written` integer DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `sync_runs_source_idx` ON `sync_runs` (`source`,`started_at`);