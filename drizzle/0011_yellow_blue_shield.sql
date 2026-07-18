CREATE TABLE `stock_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`eventType` enum('count','receipt','adjustment') NOT NULL,
	`quantityCases` decimal(10,4) NOT NULL,
	`countSessionId` int,
	`invoiceId` int,
	`invoiceLineId` int,
	`notes` text,
	`createdBy` int,
	`eventDate` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `orderedQty` decimal(10,4);--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `category` varchar(64);--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `notReceived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `stock_events` ADD CONSTRAINT `stock_events_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_events` ADD CONSTRAINT `stock_events_countSessionId_count_sessions_id_fk` FOREIGN KEY (`countSessionId`) REFERENCES `count_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_events` ADD CONSTRAINT `stock_events_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_events` ADD CONSTRAINT `stock_events_invoiceLineId_invoice_lines_id_fk` FOREIGN KEY (`invoiceLineId`) REFERENCES `invoice_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_events` ADD CONSTRAINT `stock_events_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_stock_events_item` ON `stock_events` (`itemId`);--> statement-breakpoint
CREATE INDEX `idx_stock_events_type` ON `stock_events` (`eventType`);--> statement-breakpoint
CREATE INDEX `idx_stock_events_date` ON `stock_events` (`eventDate`);--> statement-breakpoint
CREATE INDEX `idx_stock_events_invoice` ON `stock_events` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `idx_stock_events_session` ON `stock_events` (`countSessionId`);