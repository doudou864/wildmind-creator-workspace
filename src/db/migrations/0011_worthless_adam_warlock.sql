ALTER TABLE `assets` ADD `fixture` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `image_generations` ADD `fixture` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `image_tasks` ADD `fixture` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `layouts` ADD `fixture` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `fixture` integer DEFAULT false NOT NULL;