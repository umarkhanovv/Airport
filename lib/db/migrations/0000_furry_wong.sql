CREATE TABLE `flight_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`flight_no` text NOT NULL,
	`flight_no_norm` text NOT NULL,
	`city_raw` text NOT NULL,
	`city_key` text NOT NULL,
	`scheduled_time` text,
	`intl` integer,
	`aircraft` text,
	`turnaround_key` text NOT NULL,
	`source_row` integer NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `schedule_uploads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flight_entries_natural_key` ON `flight_entries` (`upload_id`,`date`,`kind`,`flight_no_norm`,`scheduled_time`);--> statement-breakpoint
CREATE INDEX `flight_entries_date_kind` ON `flight_entries` (`date`,`kind`,`scheduled_time`);--> statement-breakpoint
CREATE INDEX `flight_entries_flight_no` ON `flight_entries` (`flight_no_norm`);--> statement-breakpoint
CREATE INDEX `flight_entries_upload` ON `flight_entries` (`upload_id`);--> statement-breakpoint
CREATE TABLE `schedule_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`original_filename` text NOT NULL,
	`stored_path` text NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_at` text DEFAULT (current_timestamp) NOT NULL,
	`week_start` text,
	`week_end` text,
	`entry_count` integer DEFAULT 0 NOT NULL,
	`warnings` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT false NOT NULL
);
