CREATE TABLE `image_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`usage_date` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`duration_ms` integer,
	`calls` integer NOT NULL,
	`reason` text,
	`thread_id` text,
	`source_path` text,
	`asset_id` text,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
