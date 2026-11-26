-- AlterTable
ALTER TABLE `MeetingNote` ADD COLUMN `teamsEventId` VARCHAR(500) NULL;

-- CreateTable
CREATE TABLE `MeetingAttendee` (
    `id` VARCHAR(191) NOT NULL,
    `meetingNoteId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `name` VARCHAR(191) NULL,
    `response` VARCHAR(32) NOT NULL DEFAULT 'none',
    `respondedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MeetingAttendee_meetingNoteId_email_key`(`meetingNoteId`, `email`),
    INDEX `MeetingAttendee_meetingNoteId_idx`(`meetingNoteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MeetingAttendee` ADD CONSTRAINT `MeetingAttendee_meetingNoteId_fkey` FOREIGN KEY (`meetingNoteId`) REFERENCES `MeetingNote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
