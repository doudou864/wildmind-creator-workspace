CREATE TABLE `attention_items` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`deadline` text,
	`space_id` integer,
	`page` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
