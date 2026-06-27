CREATE TABLE `invoice_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`itemId` int,
	`itemNumber` varchar(64),
	`description` varchar(255),
	`pack` varchar(64),
	`size` varchar(64),
	`shippedQty` decimal(10,4) NOT NULL DEFAULT '0',
	`unitPrice` decimal(10,4),
	`extension` decimal(10,2),
	`matchStatus` enum('matched','unmatched','skipped') NOT NULL DEFAULT 'unmatched',
	CONSTRAINT `invoice_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vendor` varchar(64) NOT NULL DEFAULT 'PFG',
	`invoiceNumber` varchar(64),
	`invoiceDate` varchar(32),
	`totalAmount` decimal(10,2),
	`imageKeys` json NOT NULL DEFAULT ('[]'),
	`notes` text,
	`status` enum('pending','reviewed','applied') NOT NULL DEFAULT 'pending',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `count_entries` MODIFY COLUMN `quantity` decimal(10,4) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `count_entries` ADD `confirmed` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD CONSTRAINT `invoice_lines_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD CONSTRAINT `invoice_lines_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_invoice_lines_invoice` ON `invoice_lines` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `idx_invoice_lines_item` ON `invoice_lines` (`itemId`);--> statement-breakpoint
CREATE INDEX `idx_invoices_status` ON `invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_invoices_created` ON `invoices` (`createdAt`);