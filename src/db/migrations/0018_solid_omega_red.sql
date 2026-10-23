ALTER TABLE `image_studio_chats` ADD `title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `image_studio_chats` ADD `archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `image_studio_turns` ADD `ratio` text DEFAULT '' NOT NULL;