CREATE TABLE `message_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`unit` text NOT NULL,
	`message_id` text NOT NULL,
	`action` text NOT NULL,
	`baseline` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
