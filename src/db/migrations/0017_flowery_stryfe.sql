CREATE TABLE `image_studio_chats` (
	`session_id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `image_studio_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`input` text NOT NULL,
	`skill_id` text,
	`skill_name` text,
	`purpose_id` text NOT NULL,
	`reference_ids` text NOT NULL,
	`output` text NOT NULL,
	`error` text,
	`status` text NOT NULL,
	`asset_ids` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
