CREATE TABLE `flight_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`flight_no_norm` text NOT NULL,
	`is_added` integer DEFAULT false NOT NULL,
	`is_removed` integer DEFAULT false NOT NULL,
	`flight_no` text,
	`city_raw` text,
	`city_key` text,
	`scheduled_time` text,
	`intl` integer,
	`aircraft` text,
	`actual_time` text,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flight_edits_key` ON `flight_edits` (`date`,`kind`,`flight_no_norm`);--> statement-breakpoint
CREATE INDEX `flight_edits_date` ON `flight_edits` (`date`);