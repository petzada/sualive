CREATE TABLE `billing_early_supporters` (
	`position` integer PRIMARY KEY NOT NULL,
	`user_id` text,
	`granted_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "billing_early_supporters_position_check" CHECK("billing_early_supporters"."position" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_early_supporters_user_id_unique` ON `billing_early_supporters` (`user_id`);--> statement-breakpoint
CREATE TABLE `billing_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`cycle` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`woovi_subscription_correlation_id` text,
	`woovi_installment_id` text,
	`br_code` text,
	`qr_code_image_url` text,
	`expires_at` integer,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_payments_correlation_id_unique` ON `billing_payments` (`correlation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_payments_woovi_installment_id_unique` ON `billing_payments` (`woovi_installment_id`);--> statement-breakpoint
CREATE INDEX `billing_payments_user_idx` ON `billing_payments` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `billing_payments_subscription_idx` ON `billing_payments` (`woovi_subscription_correlation_id`);--> statement-breakpoint
CREATE TABLE `billing_subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`cycle` text NOT NULL,
	`status` text NOT NULL,
	`period_end` integer NOT NULL,
	`past_due_since` integer,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`woovi_correlation_id` text,
	`cancel_requested_at` integer,
	`cancel_confirmed_at` integer,
	`expiry_notice_at` integer,
	`checked_at` integer,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `billing_subscriptions_status_idx` ON `billing_subscriptions` (`status`,`checked_at`);--> statement-breakpoint
CREATE INDEX `billing_subscriptions_woovi_correlation_idx` ON `billing_subscriptions` (`woovi_correlation_id`);--> statement-breakpoint
CREATE TABLE `billing_webhook_events` (
	`event_key` text PRIMARY KEY NOT NULL,
	`processed_at` integer NOT NULL
);
