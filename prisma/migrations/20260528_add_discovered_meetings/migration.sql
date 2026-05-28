-- CreateTable
CREATE TABLE `DiscoveredMeeting` (
    `id` VARCHAR(191) NOT NULL,
    `teamsMeetingId` VARCHAR(500) NOT NULL,
    `organizerEmail` VARCHAR(191) NOT NULL,
    `organizerGraphId` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `joinWebUrl` TEXT NULL,
    `hasTranscript` BOOLEAN NOT NULL DEFAULT false,
    `hasRecording` BOOLEAN NOT NULL DEFAULT false,
    `transcriptCreatedAt` DATETIME(3) NULL,
    `recordingCreatedAt` DATETIME(3) NULL,
    `promotedMeetingNoteId` VARCHAR(191) NULL,
    `promotedAt` DATETIME(3) NULL,
    `discoveredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DiscoveredMeeting_teamsMeetingId_key`(`teamsMeetingId`),
    INDEX `DiscoveredMeeting_organizerEmail_idx`(`organizerEmail`),
    INDEX `DiscoveredMeeting_startedAt_idx`(`startedAt`),
    INDEX `DiscoveredMeeting_promotedMeetingNoteId_idx`(`promotedMeetingNoteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
