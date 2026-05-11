-- DropIndex
DROP INDEX `MeetingNote_teamsMeetingId_idx` ON `MeetingNote`;

-- CreateTable
CREATE TABLE `MomDelivery` (
    `id` VARCHAR(191) NOT NULL,
    `meetingNoteId` VARCHAR(191) NOT NULL,
    `recipientEmail` VARCHAR(191) NOT NULL,
    `recipientName` VARCHAR(191) NULL,
    `subject` TEXT NOT NULL,
    `mailgunMessageId` VARCHAR(500) NULL,
    `status` ENUM('queued', 'sent', 'delivered', 'opened', 'failed') NOT NULL DEFAULT 'queued',
    `sentAt` DATETIME(3) NULL,
    `deliveredAt` DATETIME(3) NULL,
    `openedAt` DATETIME(3) NULL,
    `openCount` INTEGER NOT NULL DEFAULT 0,
    `lastOpenedAt` DATETIME(3) NULL,
    `errorMessage` TEXT NULL,
    `lastEventAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MomDelivery_meetingNoteId_idx`(`meetingNoteId`),
    INDEX `MomDelivery_recipientEmail_idx`(`recipientEmail`),
    INDEX `MomDelivery_status_idx`(`status`),
    INDEX `MomDelivery_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MomDelivery` ADD CONSTRAINT `MomDelivery_meetingNoteId_fkey` FOREIGN KEY (`meetingNoteId`) REFERENCES `MeetingNote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

