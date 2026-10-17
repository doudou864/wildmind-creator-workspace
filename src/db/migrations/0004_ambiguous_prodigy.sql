ALTER TABLE `account_daily` ADD `backfilled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `account_daily` ADD `precision` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_daily` ADD `raw_value` text;--> statement-breakpoint
ALTER TABLE `crawl_logs` ADD `telemetry` text;--> statement-breakpoint
ALTER TABLE `post_snapshots` ADD `precision` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `post_snapshots` ADD `raw_value` text;