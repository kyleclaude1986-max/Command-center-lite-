CREATE TABLE `body_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`measured_on` text NOT NULL,
	`weight_lb` real,
	`muscle_mass_lb` real,
	`fat_mass_lb` real,
	`body_fat_pct` real,
	`source` text DEFAULT 'manual' NOT NULL,
	`apple_health_uuid` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_metrics_apple_health_uuid_unique` ON `body_metrics` (`apple_health_uuid`);--> statement-breakpoint
CREATE INDEX `body_metrics_measured_on_idx` ON `body_metrics` (`measured_on`);--> statement-breakpoint
CREATE TABLE `exercise_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_exercise_id` integer NOT NULL,
	`set_number` integer DEFAULT 1 NOT NULL,
	`reps` integer,
	`weight_lb` real,
	`is_warmup` integer DEFAULT false NOT NULL,
	`rpe` real,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exercise_sets_workout_exercise_idx` ON `exercise_sets` (`workout_exercise_id`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`muscle_group` text DEFAULT 'other' NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_slug_unique` ON `exercises` (`slug`);--> statement-breakpoint
CREATE INDEX `exercises_muscle_group_idx` ON `exercises` (`muscle_group`);--> statement-breakpoint
CREATE TABLE `food_log_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`logged_on` text NOT NULL,
	`meal` text DEFAULT 'snack' NOT NULL,
	`food_id` integer NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`serving_grams_at_log` real DEFAULT 100 NOT NULL,
	`calories` real DEFAULT 0 NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `food_log_entries_logged_on_idx` ON `food_log_entries` (`logged_on`);--> statement-breakpoint
CREATE TABLE `foods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`serving_name` text DEFAULT '100 g' NOT NULL,
	`serving_grams` real DEFAULT 100 NOT NULL,
	`calories_per_100g` real DEFAULT 0 NOT NULL,
	`protein_per_100g` real DEFAULT 0 NOT NULL,
	`carbs_per_100g` real DEFAULT 0 NOT NULL,
	`fat_per_100g` real DEFAULT 0 NOT NULL,
	`fiber_per_100g` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `foods_source_id_idx` ON `foods` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `foods_name_idx` ON `foods` (`name`);--> statement-breakpoint
CREATE INDEX `foods_last_used_idx` ON `foods` (`last_used_at`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`target_days_per_week` integer DEFAULT 1 NOT NULL,
	`min_duration_sec` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `goals_slug_unique` ON `goals` (`slug`);--> statement-breakpoint
CREATE TABLE `gym_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timezone` text DEFAULT 'America/Chicago' NOT NULL,
	`scanned_calendars` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_ingests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`received_at` integer DEFAULT (unixepoch()) NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`error` text,
	`workouts_written` integer DEFAULT 0 NOT NULL,
	`metrics_written` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_ingests_received_idx` ON `health_ingests` (`received_at`);--> statement-breakpoint
CREATE TABLE `macro_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_type_id` integer,
	`scope_key` integer NOT NULL,
	`calories` real DEFAULT 2200 NOT NULL,
	`protein_g` real DEFAULT 180 NOT NULL,
	`carbs_g` real DEFAULT 200 NOT NULL,
	`fat_g` real DEFAULT 70 NOT NULL,
	`calories_direction` text DEFAULT 'at_most' NOT NULL,
	`protein_direction` text DEFAULT 'at_least' NOT NULL,
	`carbs_direction` text DEFAULT 'at_most' NOT NULL,
	`fat_direction` text DEFAULT 'at_most' NOT NULL,
	`tolerance_pct` real DEFAULT 10 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workout_type_id`) REFERENCES `workout_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `macro_targets_scope_idx` ON `macro_targets` (`scope_key`);--> statement-breakpoint
CREATE TABLE `progress_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taken_on` text NOT NULL,
	`pose` text DEFAULT 'front' NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text DEFAULT 'image/jpeg' NOT NULL,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `progress_photos_storage_key_unique` ON `progress_photos` (`storage_key`);--> statement-breakpoint
CREATE INDEX `progress_photos_taken_on_idx` ON `progress_photos` (`taken_on`);--> statement-breakpoint
CREATE TABLE `recovery_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`performed_on` text NOT NULL,
	`recovery_type_id` integer NOT NULL,
	`workout_id` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`recovery_type_id`) REFERENCES `recovery_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_log_day_type_idx` ON `recovery_log` (`performed_on`,`recovery_type_id`);--> statement-breakpoint
CREATE TABLE `recovery_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`goal_id` integer,
	`color` text DEFAULT '#b08968' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_types_slug_unique` ON `recovery_types` (`slug`);--> statement-breakpoint
CREATE TABLE `saved_meal_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`saved_meal_id` integer NOT NULL,
	`food_id` integer NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`serving_grams` real DEFAULT 100 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`saved_meal_id`) REFERENCES `saved_meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `saved_meal_items_meal_idx` ON `saved_meal_items` (`saved_meal_id`);--> statement-breakpoint
CREATE TABLE `saved_meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`meal` text DEFAULT 'breakfast' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scheduled_workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`calendar_name` text NOT NULL,
	`external_uid` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`scheduled_on` text NOT NULL,
	`guessed_type_id` integer,
	`confirmed_workout_id` integer,
	`dismissed_at` integer,
	`last_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`guessed_type_id`) REFERENCES `workout_types`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`confirmed_workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_workouts_uid_idx` ON `scheduled_workouts` (`calendar_name`,`external_uid`,`starts_at`);--> statement-breakpoint
CREATE INDEX `scheduled_workouts_scheduled_on_idx` ON `scheduled_workouts` (`scheduled_on`);--> statement-breakpoint
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
CREATE INDEX `sync_runs_source_idx` ON `sync_runs` (`source`,`started_at`);--> statement-breakpoint
CREATE TABLE `vacations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`label` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vacations_starts_on_idx` ON `vacations` (`starts_on`);--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`notes` text,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_idx` ON `workout_exercises` (`workout_id`);--> statement-breakpoint
CREATE INDEX `workout_exercises_exercise_idx` ON `workout_exercises` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `workout_subtypes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_type_id` integer NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`workout_type_id`) REFERENCES `workout_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_subtypes_type_slug_idx` ON `workout_subtypes` (`workout_type_id`,`slug`);--> statement-breakpoint
CREATE TABLE `workout_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`goal_id` integer,
	`has_subtypes` integer DEFAULT false NOT NULL,
	`color` text DEFAULT '#566270' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_types_slug_unique` ON `workout_types` (`slug`);--> statement-breakpoint
CREATE INDEX `workout_types_goal_idx` ON `workout_types` (`goal_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`performed_on` text NOT NULL,
	`workout_type_id` integer NOT NULL,
	`workout_subtype_id` integer,
	`started_at` integer,
	`duration_sec` integer,
	`duration_source` text,
	`calories_kcal` integer,
	`avg_heart_rate` integer,
	`max_heart_rate` integer,
	`rating` integer,
	`notes` text,
	`apple_health_uuid` text,
	`source_scheduled_id` integer,
	`calendar_uid` text,
	`calendar_href` text,
	`calendar_etag` text,
	`calendar_sync_state` text DEFAULT 'pending' NOT NULL,
	`calendar_sync_error` text,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workout_type_id`) REFERENCES `workout_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workout_subtype_id`) REFERENCES `workout_subtypes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workouts_apple_health_uuid_unique` ON `workouts` (`apple_health_uuid`);--> statement-breakpoint
CREATE INDEX `workouts_performed_on_idx` ON `workouts` (`performed_on`);--> statement-breakpoint
CREATE INDEX `workouts_type_idx` ON `workouts` (`workout_type_id`);--> statement-breakpoint
CREATE INDEX `workouts_calendar_state_idx` ON `workouts` (`calendar_sync_state`);