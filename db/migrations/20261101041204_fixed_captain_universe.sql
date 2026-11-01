CREATE TABLE `blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`week_count` integer NOT NULL,
	`start_inferred` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercise_aliases` (
	`alias` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pattern` text,
	`equipment` text NOT NULL,
	`unilateral` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`section_id` integer NOT NULL,
	`position` integer NOT NULL,
	`exercise_id` text,
	`name_raw` text,
	`tempo` text,
	`rest_min_sec` integer,
	`rest_max_sec` integer,
	`per_side` integer NOT NULL,
	`load` text,
	`alternatives` text,
	`raw` text NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_section_idx` ON `items` (`section_id`);--> statement-breakpoint
CREATE INDEX `items_exercise_idx` ON `items` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `schedule` (
	`week_id` integer NOT NULL,
	`track_id` text NOT NULL,
	`day` integer NOT NULL,
	`date` text NOT NULL,
	`session_id` integer NOT NULL,
	PRIMARY KEY(`week_id`, `track_id`, `day`),
	FOREIGN KEY (`week_id`) REFERENCES `weeks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `schedule_session_idx` ON `schedule` (`session_id`);--> statement-breakpoint
CREATE TABLE `sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`position` integer NOT NULL,
	`label` text,
	`title` text NOT NULL,
	`role` text NOT NULL,
	`format` text,
	`minutes_min` integer,
	`minutes_max` integer,
	`scheme` text NOT NULL,
	`notes` text NOT NULL,
	`content_hash` text NOT NULL,
	`raw` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sections_session_idx` ON `sections` (`session_id`);--> statement-breakpoint
CREATE INDEX `sections_hash_idx` ON `sections` (`content_hash`);--> statement-breakpoint
CREATE INDEX `sections_role_idx` ON `sections` (`role`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`focus_topic` text,
	`focus_body` text,
	`short_on_time` text NOT NULL,
	`content_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_content_hash_unique` ON `sessions` (`content_hash`);--> statement-breakpoint
CREATE TABLE `sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`reps_min` real,
	`reps_max` real,
	`reps_type` text NOT NULL,
	`unit` text,
	`value_female` real,
	`rpe_min` real,
	`rpe_max` real,
	`effort` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sets_item_idx` ON `sets` (`item_id`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`family` text NOT NULL,
	`days_per_week` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weeks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` integer NOT NULL,
	`week_number` integer NOT NULL,
	`start_date` text NOT NULL,
	`status` text NOT NULL,
	`source_file` text,
	`note_title` text,
	`note_body` text,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weeks_start_date_unique` ON `weeks` (`start_date`);--> statement-breakpoint
CREATE INDEX `weeks_block_idx` ON `weeks` (`block_id`);