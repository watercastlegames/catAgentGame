CREATE TABLE `cat_need_state` (
	`user_id` text NOT NULL,
	`cat_thread_id` text NOT NULL,
	`hunger` integer DEFAULT 0 NOT NULL,
	`toilet` integer DEFAULT 0 NOT NULL,
	`happiness` integer DEFAULT 30 NOT NULL,
	`last_computed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cat_need_state_user_thread_idx` ON `cat_need_state` (`user_id`,`cat_thread_id`);--> statement-breakpoint
CREATE TABLE `player_shell_delta_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`applied_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shell_delta_user_idx` ON `player_shell_delta_log` (`user_id`,`applied_at`);--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_sessions_token_idx` ON `user_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `user_sessions_user_idx` ON `user_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text,
	`oai_user_email` text,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_login_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_idx` ON `users` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_oai_email_idx` ON `users` (`oai_user_email`);--> statement-breakpoint
CREATE TABLE `workstation_decor_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`owned_item_ids_json` text DEFAULT '[]' NOT NULL,
	`seats_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
