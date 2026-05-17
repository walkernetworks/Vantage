ALTER TABLE `items` ADD `webstaurantItemNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `items` ADD `countMode` varchar(8) DEFAULT 'case' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;