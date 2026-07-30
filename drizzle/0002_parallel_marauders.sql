CREATE TABLE `company_cli_quota_daily` (
	`scope` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `company_cli_quota_hourly` (
	`device_id` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL
);
