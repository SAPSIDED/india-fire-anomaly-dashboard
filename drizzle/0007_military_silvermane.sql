CREATE TABLE `gas_flare_reference` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flareId` varchar(64) NOT NULL,
	`country` varchar(64) NOT NULL,
	`latitude` decimal(9,6) NOT NULL,
	`longitude` decimal(9,6) NOT NULL,
	`location` varchar(32),
	`fieldType` varchar(64),
	`fieldName` varchar(255),
	`operator` varchar(255),
	`latestAnnualVolumeMcm` decimal(18,9),
	`sourceDataYear` int NOT NULL,
	`sourceUrl` varchar(1024) NOT NULL,
	`loadedAt` timestamp NOT NULL,
	CONSTRAINT `gas_flare_reference_id` PRIMARY KEY(`id`),
	CONSTRAINT `gasFlareReference_flareId_unique` UNIQUE(`flareId`)
);
--> statement-breakpoint
CREATE INDEX `gasFlareReference_latitude_longitude_idx` ON `gas_flare_reference` (`latitude`,`longitude`);