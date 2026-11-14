CREATE TABLE `gold_gift_daily` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`sent` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "gold_gift_daily_limit" CHECK("gold_gift_daily"."sent" BETWEEN 0 AND 2000)
);
--> statement-breakpoint
CREATE TABLE `gold_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`pack_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`gold` integer NOT NULL,
	`status` text NOT NULL,
	`correlation_id` text NOT NULL,
	`br_code` text,
	`qr_code_image_url` text,
	`expires_at` integer,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gold_purchases_correlation_id_unique` ON `gold_purchases` (`correlation_id`);--> statement-breakpoint
CREATE INDEX `gold_purchases_user_idx` ON `gold_purchases` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `shop_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`data` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "shop_items_price_check" CHECK("shop_items"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE `user_items` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`equipped` integer DEFAULT 0 NOT NULL,
	`acquired_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `shop_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `wallet_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`currency` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`reference` text NOT NULL,
	`counterpart_user_id` text,
	`item_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`counterpart_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "wallet_ledger_amount_check" CHECK("wallet_ledger"."amount" != 0),
	CONSTRAINT "wallet_ledger_currency_check" CHECK("wallet_ledger"."currency" IN ('silver', 'gold'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_ledger_reference_unique` ON `wallet_ledger` (`reference`);--> statement-breakpoint
CREATE INDEX `wallet_ledger_user_idx` ON `wallet_ledger` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`silver` integer DEFAULT 0 NOT NULL,
	`gold` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "wallets_non_negative" CHECK("wallets"."silver" >= 0 AND "wallets"."gold" >= 0)
);
