CREATE TABLE `review_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`day` integer NOT NULL,
	`metric_id` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_post_day_metric` ON `review_checkpoints` (`post_id`,`day`,`metric_id`);