CREATE TABLE `image_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`pid` integer,
	`asset_ids` text NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
