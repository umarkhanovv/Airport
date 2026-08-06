CREATE TABLE `news_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`locale` text NOT NULL,
	`translation_group_id` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text,
	`body` text NOT NULL,
	`cover_image` text,
	`cover_alt` text,
	`published_at` text NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`legacy_url` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_posts_slug_locale` ON `news_posts` (`slug`,`locale`);--> statement-breakpoint
CREATE INDEX `news_posts_locale_published` ON `news_posts` (`locale`,`is_published`,`published_at`);--> statement-breakpoint
CREATE INDEX `news_posts_translation_group` ON `news_posts` (`translation_group_id`);