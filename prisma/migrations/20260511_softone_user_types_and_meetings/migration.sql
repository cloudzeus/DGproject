-- AlterTable
ALTER TABLE `Project` ADD COLUMN `customerUserId` VARCHAR(191) NULL,
    ADD COLUMN `projectCode` VARCHAR(191) NULL,
    ADD COLUMN `softoneCompany` INTEGER NULL,
    ADD COLUMN `softoneId` INTEGER NULL,
    ADD COLUMN `softoneSyncError` TEXT NULL,
    ADD COLUMN `softoneSyncStatus` ENUM('unsynced', 'syncing', 'synced', 'conflict', 'error') NOT NULL DEFAULT 'unsynced',
    ADD COLUMN `softoneSyncedAt` DATETIME(3) NULL,
    ADD COLUMN `softoneVersion` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Task` ADD COLUMN `generatedFromMeetingId` VARCHAR(191) NULL,
    ADD COLUMN `meetingNeedsReview` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `meetingSourceConfidence` DOUBLE NULL,
    ADD COLUMN `meetingSourceQuote` TEXT NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `companyAfm` VARCHAR(191) NULL,
    ADD COLUMN `companyName` VARCHAR(191) NULL,
    ADD COLUMN `softoneCompany` INTEGER NULL,
    ADD COLUMN `softoneContactLine` INTEGER NULL,
    ADD COLUMN `softoneCustomerId` INTEGER NULL,
    ADD COLUMN `softonePrsnId` INTEGER NULL,
    ADD COLUMN `softoneSupplierId` INTEGER NULL,
    ADD COLUMN `softoneSyncError` TEXT NULL,
    ADD COLUMN `softoneSyncStatus` ENUM('unsynced', 'syncing', 'synced', 'conflict', 'error') NOT NULL DEFAULT 'unsynced',
    ADD COLUMN `softoneSyncedAt` DATETIME(3) NULL,
    ADD COLUMN `softoneUserId` INTEGER NULL,
    ADD COLUMN `userType` ENUM('employee', 'customer', 'supplier') NOT NULL DEFAULT 'employee';

-- CreateTable
CREATE TABLE `MeetingNote` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `organizerId` VARCHAR(191) NOT NULL,
    `teamsMeetingId` VARCHAR(191) NULL,
    `teamsJoinUrl` TEXT NULL,
    `teamsTranscriptId` VARCHAR(191) NULL,
    `subject` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NOT NULL,
    `durationSec` INTEGER NOT NULL,
    `transcriptVtt` LONGTEXT NULL,
    `summary` TEXT NULL,
    `decisions` JSON NULL,
    `actionItems` JSON NULL,
    `risks` JSON NULL,
    `openQuestions` JSON NULL,
    `llmProvider` VARCHAR(191) NULL,
    `llmModel` VARCHAR(191) NULL,
    `llmInputTokens` INTEGER NULL,
    `llmOutputTokens` INTEGER NULL,
    `llmDurationMs` INTEGER NULL,
    `autoTasksCreated` INTEGER NOT NULL DEFAULT 0,
    `autoTasksNeedReview` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('pending', 'processing', 'ready', 'failed') NOT NULL DEFAULT 'pending',
    `errorMessage` TEXT NULL,
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MeetingNote_projectId_idx`(`projectId`),
    INDEX `MeetingNote_organizerId_idx`(`organizerId`),
    INDEX `MeetingNote_status_idx`(`status`),
    INDEX `MeetingNote_createdAt_idx`(`createdAt`),
    INDEX `MeetingNote_startedAt_idx`(`startedAt`),
    INDEX `MeetingNote_teamsMeetingId_idx`(`teamsMeetingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Project_projectCode_key` ON `Project`(`projectCode`);

-- CreateIndex
CREATE UNIQUE INDEX `Project_softoneId_key` ON `Project`(`softoneId`);

-- CreateIndex
CREATE INDEX `Project_projectCode_idx` ON `Project`(`projectCode`);

-- CreateIndex
CREATE INDEX `Project_softoneId_idx` ON `Project`(`softoneId`);

-- CreateIndex
CREATE INDEX `Project_softoneSyncStatus_idx` ON `Project`(`softoneSyncStatus`);

-- CreateIndex
CREATE INDEX `Task_generatedFromMeetingId_idx` ON `Task`(`generatedFromMeetingId`);

-- CreateIndex
CREATE INDEX `Task_meetingNeedsReview_idx` ON `Task`(`meetingNeedsReview`);

-- CreateIndex
CREATE UNIQUE INDEX `User_softoneUserId_key` ON `User`(`softoneUserId`);

-- CreateIndex
CREATE UNIQUE INDEX `User_softonePrsnId_key` ON `User`(`softonePrsnId`);

-- CreateIndex
CREATE UNIQUE INDEX `User_softoneCustomerId_key` ON `User`(`softoneCustomerId`);

-- CreateIndex
CREATE UNIQUE INDEX `User_softoneSupplierId_key` ON `User`(`softoneSupplierId`);

-- CreateIndex
CREATE INDEX `User_userType_idx` ON `User`(`userType`);

-- CreateIndex
CREATE INDEX `User_softoneCustomerId_idx` ON `User`(`softoneCustomerId`);

-- CreateIndex
CREATE INDEX `User_softoneSupplierId_idx` ON `User`(`softoneSupplierId`);

-- CreateIndex
CREATE INDEX `User_softoneUserId_idx` ON `User`(`softoneUserId`);

-- CreateIndex
CREATE INDEX `User_softoneSyncStatus_idx` ON `User`(`softoneSyncStatus`);

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_generatedFromMeetingId_fkey` FOREIGN KEY (`generatedFromMeetingId`) REFERENCES `MeetingNote`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingNote` ADD CONSTRAINT `MeetingNote_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingNote` ADD CONSTRAINT `MeetingNote_organizerId_fkey` FOREIGN KEY (`organizerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

