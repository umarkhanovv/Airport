CREATE TABLE `feedback_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`subject` text,
	`message` text NOT NULL,
	`locale` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`ip_hash` text
);
--> statement-breakpoint
CREATE INDEX `feedback_is_read_created` ON `feedback_submissions` (`is_read`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_created` ON `feedback_submissions` (`created_at`);