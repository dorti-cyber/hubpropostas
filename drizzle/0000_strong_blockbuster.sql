CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`proposal_version_id` text NOT NULL,
	`file_name` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_hash` text NOT NULL,
	`file_hash` text NOT NULL,
	`canonical` integer NOT NULL,
	`attempt_number` integer NOT NULL,
	`author` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposal_version_id`) REFERENCES `proposal_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artifacts_storage_key` ON `artifacts` (`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_artifacts_version_canonical` ON `artifacts` (`proposal_version_id`,`canonical`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`object_type` text NOT NULL,
	`object_id` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_role` text NOT NULL,
	`reason` text NOT NULL,
	`before_hash` text NOT NULL,
	`after_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_object_created` ON `audit_events` (`object_type`,`object_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`code` text PRIMARY KEY NOT NULL,
	`family` text,
	`nature` text,
	`name` text NOT NULL,
	`billing_unit` text,
	`source_value` text,
	`source_status` text NOT NULL,
	`default_cents` integer,
	`default_status` text NOT NULL,
	`source` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`effective_at` text,
	`updated_by` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_nature_family` ON `catalog_items` (`nature`,`family`);--> statement-breakpoint
CREATE INDEX `idx_catalog_status` ON `catalog_items` (`default_status`);--> statement-breakpoint
CREATE TABLE `pricing_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`pricing_json` text NOT NULL,
	`frozen` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pricing_versions_proposal_number` ON `pricing_versions` (`proposal_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `proposal_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`status` text NOT NULL,
	`frozen` integer NOT NULL,
	`based_on` text,
	`revision_reason` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`template_version_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_proposal_versions_proposal_number` ON `proposal_versions` (`proposal_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `idx_proposal_versions_status` ON `proposal_versions` (`status`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`client_name` text NOT NULL,
	`modalities` text NOT NULL,
	`status` text NOT NULL,
	`current_version` integer NOT NULL,
	`responsible` text NOT NULL,
	`valid_until` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`accepted_proposal_version_id` text,
	`pipefy_card_id` text,
	`integration_status` text DEFAULT 'Não configurada' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_proposals_code` ON `proposals` (`code`);--> statement-breakpoint
CREATE INDEX `idx_proposals_status_updated` ON `proposals` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_proposals_client` ON `proposals` (`client_name`);--> statement-breakpoint
CREATE INDEX `idx_proposals_responsible` ON `proposals` (`responsible`);--> statement-breakpoint
CREATE INDEX `idx_proposals_valid_until` ON `proposals` (`valid_until`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`status` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`content_json` text NOT NULL,
	`published` integer NOT NULL,
	`effective_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_template_versions_version` ON `template_versions` (`version`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);