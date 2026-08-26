CREATE TABLE `detectionHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`latitude` decimal(9,6) NOT NULL,
	`longitude` decimal(9,6) NOT NULL,
	`detectionDate` date NOT NULL,
	`brightness` decimal(10,3),
	`confidence` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `detectionHistory_id` PRIMARY KEY(`id`),
	CONSTRAINT `detectionHistory_unique_location_date` UNIQUE(`latitude`,`longitude`,`detectionDate`)
);
