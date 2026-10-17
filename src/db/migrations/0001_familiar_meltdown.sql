CREATE TABLE `raw_records` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_id` text NOT NULL,
	`post_id` text,
	`data_date` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`source_path` text NOT NULL,
	`captured_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "raw_record_json" CHECK(json_valid("raw_records"."content")),
	CONSTRAINT "raw_record_source" CHECK("raw_records"."source_path" LIKE 'data/%' AND instr("raw_records"."source_path", '..') = 0)
);
