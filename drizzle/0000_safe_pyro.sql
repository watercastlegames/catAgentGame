CREATE TABLE `relay_browser_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`device_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `relay_devices`(`device_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relay_browser_sessions_token_idx` ON `relay_browser_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `relay_browser_sessions_device_idx` ON `relay_browser_sessions` (`device_id`);--> statement-breakpoint
CREATE TABLE `relay_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result_json` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`claimed_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`device_id`) REFERENCES `relay_devices`(`device_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `relay_commands_queue_idx` ON `relay_commands` (`device_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `relay_devices` (
	`device_id` text PRIMARY KEY NOT NULL,
	`secret_hash` text NOT NULL,
	`pairing_code_hash` text NOT NULL,
	`pairing_expires_at` integer NOT NULL,
	`snapshot_json` text DEFAULT '{}' NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `relay_devices_pairing_idx` ON `relay_devices` (`pairing_code_hash`,`pairing_expires_at`);--> statement-breakpoint
CREATE INDEX `relay_devices_seen_idx` ON `relay_devices` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `relay_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`event_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `relay_devices`(`device_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `relay_events_device_idx` ON `relay_events` (`device_id`,`id`);--> statement-breakpoint
CREATE TABLE `relay_pair_attempts` (
	`client_hash` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL
);
