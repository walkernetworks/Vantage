CREATE TABLE `vendor_integrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vendorName` varchar(64) NOT NULL,
	`connectionType` varchar(32) NOT NULL DEFAULT 'imap',
	`email` varchar(320),
	`encryptedPassword` text,
	`config` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastSyncedAt` timestamp,
	`lastSyncStatus` varchar(32),
	`lastSyncMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendor_integrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `import_batches` MODIFY COLUMN `priceSnapshot` json;