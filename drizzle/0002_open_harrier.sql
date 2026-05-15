CREATE TABLE `price_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`oldPrice` decimal(10,2),
	`newPrice` decimal(10,2) NOT NULL,
	`importSource` varchar(32) NOT NULL DEFAULT 'PFG',
	`importedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `price_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `items` ADD `pfgProductNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `items` ADD `brand` varchar(128);--> statement-breakpoint
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_price_history_item` ON `price_history` (`itemId`);--> statement-breakpoint
CREATE INDEX `idx_items_pfg_product_number` ON `items` (`pfgProductNumber`);