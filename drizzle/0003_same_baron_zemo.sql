CREATE TABLE `settings_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `settings_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `settings_storage_areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `settings_storage_areas_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_storage_areas_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `settings_vendors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `settings_vendors_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_vendors_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `items` ADD `caseQty` int;--> statement-breakpoint
ALTER TABLE `items` ADD `eachPrice` decimal(10,4);