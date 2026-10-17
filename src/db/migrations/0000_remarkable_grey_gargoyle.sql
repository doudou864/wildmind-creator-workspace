CREATE TABLE `account_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`data_date` text NOT NULL,
	`metric_id` text NOT NULL,
	`value` real,
	`captured_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `accounts`(`platform_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_day_metric` ON `account_daily` (`platform_id`,`data_date`,`metric_id`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`platform_id` text PRIMARY KEY NOT NULL,
	`platform_account_id` text,
	`display_name` text,
	`login_state` text DEFAULT 'unknown' NOT NULL,
	`checked_at` text,
	`reason` text,
	`state_path` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`content_id` text,
	`topic_id` text,
	`title` text NOT NULL,
	`purpose_id` text NOT NULL,
	`ratio` text NOT NULL,
	`path` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`mime` text NOT NULL,
	`source` text NOT NULL,
	`prompt` text NOT NULL,
	`version` integer NOT NULL,
	`selected` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_family_version` ON `assets` (`family_id`,`version`);--> statement-breakpoint
CREATE TABLE `contents` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text,
	`form` text NOT NULL,
	`title` text NOT NULL,
	`planned_date` text,
	`video_covers` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crawl_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`reason` text,
	`archive_paths` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "crawl_completion" CHECK(("crawl_logs"."status" = 'running' AND "crawl_logs"."finished_at" IS NULL) OR ("crawl_logs"."status" = 'success' AND "crawl_logs"."finished_at" IS NOT NULL AND "crawl_logs"."reason" IS NULL) OR ("crawl_logs"."status" = 'failed' AND "crawl_logs"."finished_at" IS NOT NULL AND length(trim("crawl_logs"."reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`brand` text,
	`requirement` text,
	`status` text NOT NULL,
	`platform_id` text NOT NULL,
	`channel` text NOT NULL,
	`message_id` text NOT NULL,
	`suggestion` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deals_message_id_unique` ON `deals` (`message_id`);--> statement-breakpoint
CREATE TABLE `demand_themes` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`message_ids` text NOT NULL,
	`signal_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`signal_id`) REFERENCES `topic_signals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `image_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`input` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `layouts` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text,
	`source` text NOT NULL,
	`variants` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`platform_id` text NOT NULL,
	`channel` text NOT NULL,
	`post_id` text,
	`content_id` text,
	`content_title` text,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`sent_at` text,
	`captured_at` text,
	`source_url` text,
	`classification` text NOT NULL,
	`reply` text NOT NULL,
	`context` text NOT NULL,
	`context_complete` integer NOT NULL,
	`deal_id` text,
	`deal_sync` text NOT NULL,
	`deal_sync_reason` text,
	`topic_signal_id` text,
	`topic_synced_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_signal_id`) REFERENCES `topic_signals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `post_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`captured_at` text NOT NULL,
	`capture_date` text NOT NULL,
	`day_after_publish` integer,
	`metric_id` text NOT NULL,
	`value` real,
	`backfill_kind` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshot_capture_metric` ON `post_snapshots` (`post_id`,`captured_at`,`metric_id`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`platform_id` text NOT NULL,
	`platform_post_id` text,
	`published_at` text,
	`title` text NOT NULL,
	`url` text,
	`checkpoint_ratios` text,
	`trend` text,
	`hit` integer,
	`first_publication` integer,
	`removed` integer,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_platform_identity` ON `posts` (`platform_id`,`platform_post_id`);--> statement-breakpoint
CREATE TABLE `publish_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`request_id` text NOT NULL,
	`receipt` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `publish_receipts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `publish_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`batch_id` text NOT NULL,
	`platform_id` text NOT NULL,
	`status` text NOT NULL,
	`screenshot_asset_id` text,
	`uploaded_at` text,
	`materials` text,
	`failure_stage` text,
	`title` text NOT NULL,
	`platform_post_id` text,
	`url` text,
	`published_at` text,
	`reason` text,
	`safe_to_retry` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `publish_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`screenshot_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_record_platform` ON `publish_receipts` (`batch_id`,`platform_id`);--> statement-breakpoint
CREATE TABLE `publish_records` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`content_id` text NOT NULL,
	`state` text NOT NULL,
	`draft` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `publish_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`action` text NOT NULL,
	`input` text NOT NULL,
	`result` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `publish_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `publish_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`layout_id` text NOT NULL,
	`layout_updated_at` text NOT NULL,
	`content_id` text NOT NULL,
	`platform` text NOT NULL,
	`content` text NOT NULL,
	`confirmed_at` text NOT NULL,
	`state` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`layout_id`) REFERENCES `layouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `publish_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`bytes` integer NOT NULL,
	`duration` real NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `topic_generation_results` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`topic_id` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`generated_fields` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `topic_generation_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `topic_generation_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topic_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`text` text NOT NULL,
	`share` real,
	`post_id` text,
	`source_url` text,
	`source_message_id` text,
	`source_theme_id` text,
	`captured_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_signals_source_message_id_unique` ON `topic_signals` (`source_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `topic_signals_source_theme_id_unique` ON `topic_signals` (`source_theme_id`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`direction` text NOT NULL,
	`channel_id` text NOT NULL,
	`signal` text NOT NULL,
	`source_context` text NOT NULL,
	`source_url` text,
	`exploration` integer NOT NULL,
	`evidence` text,
	`status` text NOT NULL,
	`frozen_fire` integer,
	`frozen_evidence` text,
	`selected_at` text,
	`automatic` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
