CREATE TABLE `daily_energy` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`measured_on` text NOT NULL,
	`active_kcal` real,
	`basal_kcal` real,
	`source` text DEFAULT 'apple_health' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_energy_measured_on_unique` ON `daily_energy` (`measured_on`);--> statement-breakpoint
CREATE INDEX `daily_energy_measured_on_idx` ON `daily_energy` (`measured_on`);--> statement-breakpoint
CREATE TABLE `plan_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`note` text,
	FOREIGN KEY (`plan_id`) REFERENCES `workout_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `plan_exercises_plan_idx` ON `plan_exercises` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plan_generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`source` text NOT NULL,
	`model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`prompt` text,
	`response` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `workout_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_generations_plan_idx` ON `plan_generations` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plan_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_exercise_id` integer NOT NULL,
	`set_number` integer DEFAULT 1 NOT NULL,
	`target_reps` integer,
	`target_weight_lb` real,
	`is_warmup` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`plan_exercise_id`) REFERENCES `plan_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_sets_plan_exercise_idx` ON `plan_sets` (`plan_exercise_id`);--> statement-breakpoint
CREATE TABLE `plan_template_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`day_of_week` integer NOT NULL,
	`workout_type_id` integer,
	`workout_subtype_id` integer,
	`target_reps_low` integer DEFAULT 8 NOT NULL,
	`target_reps_high` integer DEFAULT 12 NOT NULL,
	`rest_seconds` integer DEFAULT 90 NOT NULL,
	`exercise_count` integer DEFAULT 5 NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `plan_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout_type_id`) REFERENCES `workout_types`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout_subtype_id`) REFERENCES `workout_subtypes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_template_days_template_dow_idx` ON `plan_template_days` (`template_id`,`day_of_week`);--> statement-breakpoint
CREATE TABLE `plan_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT 'My week' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supplement_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taken_on` text NOT NULL,
	`supplement_id` integer NOT NULL,
	`taken_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`supplement_id`) REFERENCES `supplements`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplement_log_day_item_idx` ON `supplement_log` (`taken_on`,`supplement_id`);--> statement-breakpoint
CREATE INDEX `supplement_log_taken_on_idx` ON `supplement_log` (`taken_on`);--> statement-breakpoint
CREATE TABLE `supplement_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplement_slots_slug_unique` ON `supplement_slots` (`slug`);--> statement-breakpoint
CREATE TABLE `supplements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`dose` real,
	`unit` text DEFAULT 'capsule' NOT NULL,
	`slot_id` integer NOT NULL,
	`schedule_kind` text DEFAULT 'daily' NOT NULL,
	`schedule_days` text DEFAULT '[]' NOT NULL,
	`interval_days` integer,
	`starts_on` text,
	`notes` text,
	`position` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `supplement_slots`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplements_slug_unique` ON `supplements` (`slug`);--> statement-breakpoint
CREATE INDEX `supplements_slot_idx` ON `supplements` (`slot_id`);--> statement-breakpoint
CREATE TABLE `workout_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`planned_on` text NOT NULL,
	`workout_type_id` integer NOT NULL,
	`workout_subtype_id` integer,
	`target_reps_low` integer DEFAULT 8 NOT NULL,
	`target_reps_high` integer DEFAULT 12 NOT NULL,
	`rest_seconds` integer DEFAULT 90 NOT NULL,
	`exercise_count` integer DEFAULT 5 NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`generated_by` text,
	`generated_at` integer,
	`template_day_id` integer,
	`workout_id` integer,
	`is_override` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workout_type_id`) REFERENCES `workout_types`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout_subtype_id`) REFERENCES `workout_subtypes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`template_day_id`) REFERENCES `plan_template_days`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_plans_planned_on_idx` ON `workout_plans` (`planned_on`);--> statement-breakpoint
CREATE INDEX `workout_plans_status_idx` ON `workout_plans` (`status`);--> statement-breakpoint
ALTER TABLE `workout_types` ADD `is_strength` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_types` ADD `supports_planning` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `workouts` ADD `plan_id` integer;--> statement-breakpoint
UPDATE `workout_types` SET `slug` = 'ithinkfit-olympius', `name` = 'iThinkFit Olympius' WHERE `slug` = 'ithinkfit-olympus';--> statement-breakpoint
UPDATE `workout_types` SET `is_strength` = true WHERE `slug` IN ('ithinkfit-gym-fit-camp', 'ithinkfit-olympius', 'west-o-strength');--> statement-breakpoint
UPDATE `workout_types` SET `supports_planning` = true WHERE `slug` = 'west-o-strength';
