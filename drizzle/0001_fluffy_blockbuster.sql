CREATE TABLE `incidentEvidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`detectionId` varchar(96) NOT NULL,
	`latitude` decimal(9,6) NOT NULL,
	`longitude` decimal(9,6) NOT NULL,
	`sourceType` enum('authority','facility') NOT NULL,
	`sourceName` varchar(160) NOT NULL,
	`sourceUrl` varchar(1024) NOT NULL,
	`incidentReference` varchar(255) NOT NULL,
	`reportedAt` timestamp NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`details` text NOT NULL,
	`verifiedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `incidentEvidence_id` PRIMARY KEY(`id`)
);
