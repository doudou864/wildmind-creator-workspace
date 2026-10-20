CREATE TABLE `record_archives` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`record_id` text NOT NULL,
	`archived_at` text,
	`updated_at` text NOT NULL
);
