CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`page_path` text NOT NULL,
	`title` text NOT NULL,
	`stored_name` text NOT NULL,
	`original_filename` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`published_at` text NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`legacy_url` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_page_published` ON `documents` (`page_path`,`is_published`,`published_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_stored_name` ON `documents` (`stored_name`);