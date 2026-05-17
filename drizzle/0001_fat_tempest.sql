CREATE TABLE `catering_recipe_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipeId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantityNeeded` decimal(10,3) NOT NULL,
	`unit` varchar(32),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catering_recipe_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `catering_recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`baseServings` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `catering_recipes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `count_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`itemId` int NOT NULL,
	`quantity` decimal(10,2) NOT NULL DEFAULT '0',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `count_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `count_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255),
	`notes` text,
	`createdBy` int,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `count_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(64) NOT NULL,
	`vendor` varchar(64) NOT NULL,
	`packSize` varchar(64),
	`unitOfMeasure` varchar(32),
	`price` decimal(10,2),
	`parLevel` decimal(10,2) DEFAULT '0',
	`storageArea` varchar(64),
	`isAlcohol` boolean NOT NULL DEFAULT false,
	`alcoholCategory` varchar(16),
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `catering_recipe_items` ADD CONSTRAINT `catering_recipe_items_recipeId_catering_recipes_id_fk` FOREIGN KEY (`recipeId`) REFERENCES `catering_recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catering_recipe_items` ADD CONSTRAINT `catering_recipe_items_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `count_entries` ADD CONSTRAINT `count_entries_sessionId_count_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `count_sessions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `count_entries` ADD CONSTRAINT `count_entries_itemId_items_id_fk` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `count_sessions` ADD CONSTRAINT `count_sessions_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_recipe_items_recipe` ON `catering_recipe_items` (`recipeId`);--> statement-breakpoint
CREATE INDEX `idx_count_entries_session` ON `count_entries` (`sessionId`);--> statement-breakpoint
CREATE INDEX `idx_count_entries_item` ON `count_entries` (`itemId`);--> statement-breakpoint
CREATE INDEX `idx_items_category` ON `items` (`category`);--> statement-breakpoint
CREATE INDEX `idx_items_vendor` ON `items` (`vendor`);