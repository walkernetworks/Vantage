DROP INDEX `idx_items_pfg_product_number` ON `items`;--> statement-breakpoint
ALTER TABLE `count_entries` ADD `updatedBy` int;--> statement-breakpoint
ALTER TABLE `items` ADD `itemNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `permissions` json;--> statement-breakpoint
ALTER TABLE `users` ADD `mustResetPassword` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `count_entries` ADD CONSTRAINT `count_entries_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_items_vendor_item_number` ON `items` (`vendor`,`itemNumber`);--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `pfgProductNumber`;--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `webstaurantItemNumber`;