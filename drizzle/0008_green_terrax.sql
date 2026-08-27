CREATE TABLE `seasonal_agricultural_burning_calendar` (
	`id` int AUTO_INCREMENT NOT NULL,
	`state` varchar(96) NOT NULL,
	`month` int NOT NULL,
	`season` varchar(64) NOT NULL,
	`contextLevel` varchar(32) NOT NULL,
	`sourceUrl` varchar(1024) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seasonal_agricultural_burning_calendar_id` PRIMARY KEY(`id`),
	CONSTRAINT `seasonalAgriculturalBurning_state_month_unique` UNIQUE(`state`,`month`)
);
--> statement-breakpoint
CREATE TABLE `seasonal_agricultural_state_geometry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`state` varchar(96) NOT NULL,
	`geometry` mediumtext NOT NULL,
	`sourceUrl` varchar(1024) NOT NULL,
	`loadedAt` timestamp NOT NULL,
	CONSTRAINT `seasonal_agricultural_state_geometry_id` PRIMARY KEY(`id`),
	CONSTRAINT `seasonalAgriculturalStateGeometry_state_unique` UNIQUE(`state`)
);
--> statement-breakpoint
ALTER TABLE `detectionHistory` ADD `dayNight` varchar(1);--> statement-breakpoint
ALTER TABLE `detectionHistory` ADD `frp` decimal(12,4);