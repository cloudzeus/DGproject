-- AlterTable
ALTER TABLE `MeetingNote` MODIFY `status` ENUM('scheduled', 'pending', 'processing', 'ready', 'failed') NOT NULL DEFAULT 'pending';

