CREATE TABLE `import_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importSource` varchar(32) NOT NULL,
	`fileName` varchar(255),
	`itemsCreated` int NOT NULL DEFAULT 0,
	`itemsUpdated` int NOT NULL DEFAULT 0,
	`itemsUnchanged` int NOT NULL DEFAULT 0,
	`priceChangesCount` int NOT NULL DEFAULT 0,
	`priceSnapshot` json NOT NULL DEFAULT ('[]'),
	`importedBy` int,
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `import_batches` ADD CONSTRAINT `import_batches_importedBy_users_id_fk` FOREIGN KEY (`importedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_import_batches_source` ON `import_batches` (`importSource`);--> statement-breakpoint
CREATE INDEX `idx_import_batches_date` ON `import_batches` (`importedAt`);