CREATE TABLE `image_chat_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`input` text NOT NULL,
	`reference_ids` text NOT NULL,
	`output` text NOT NULL,
	`error` text,
	`status` text NOT NULL,
	`asset_ids` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `image_chats` (
	`content_id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `image_crops` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text,
	`generation_id` text NOT NULL,
	`source_path` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`ratio` text NOT NULL,
	`metadata` text NOT NULL,
	`crop` text,
	`asset_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generation_id`) REFERENCES `image_generations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
