CREATE TABLE `indiaHotspotSnapshot` (
	`id` int AUTO_INCREMENT NOT NULL,
	`latitude` decimal(9,6) NOT NULL,
	`longitude` decimal(9,6) NOT NULL,
	`brightness` decimal(10,3),
	`confidence` varchar(32),
	`acquiredDate` date NOT NULL,
	`acquiredTime` varchar(8),
	`fetchedAt` timestamp NOT NULL,
	CONSTRAINT `indiaHotspotSnapshot_id` PRIMARY KEY(`id`)
);
