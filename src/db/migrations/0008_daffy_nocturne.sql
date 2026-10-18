CREATE TABLE `data_interpretations` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`day` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`numbers` text NOT NULL,
	`paragraphs` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_interpretations_fingerprint_unique` ON `data_interpretations` (`fingerprint`);