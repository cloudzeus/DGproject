-- NOTE: FULLTEXT drops αφαιρέθηκαν — δες lib/tickets/similar.ts.

-- AlterTable
ALTER TABLE `Attachment` ADD COLUMN `visibility` ENUM('internal', 'shared') NOT NULL DEFAULT 'internal';

-- CreateIndex
CREATE INDEX `Attachment_projectId_visibility_idx` ON `Attachment`(`projectId`, `visibility`);

