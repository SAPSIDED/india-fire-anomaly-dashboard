CREATE TABLE `gppd_reference` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gppdId` varchar(64) NOT NULL,
	`country` varchar(3) NOT NULL,
	`name` varchar(255) NOT NULL,
	`primaryFuel` varchar(64),
	`capacityMw` decimal(12,3),
	`latitude` decimal(9,6) NOT NULL,
	`longitude` decimal(9,6) NOT NULL,
	`sourceUrl` varchar(1024) NOT NULL,
	`loadedAt` timestamp NOT NULL,
	CONSTRAINT `gppd_reference_id` PRIMARY KEY(`id`),
	CONSTRAINT `gppdReference_gppdId_unique` UNIQUE(`gppdId`)
);
--> statement-breakpoint
CREATE INDEX `gppdReference_latitude_longitude_idx` ON `gppd_reference` (`latitude`,`longitude`);