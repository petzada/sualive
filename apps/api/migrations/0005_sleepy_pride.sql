CREATE TABLE `access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`user_id` text,
	`session_id` text,
	`ip` text NOT NULL,
	`room_key` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "access_log_kind_check" CHECK("access_log"."kind" IN ('login', 'room_join'))
);
--> statement-breakpoint
CREATE INDEX `access_log_created_idx` ON `access_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `access_log_user_idx` ON `access_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `room_moderators` (
	`owner_user_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_user_id`, `user_id`),
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `fixed_room_protected` integer DEFAULT 0 NOT NULL;