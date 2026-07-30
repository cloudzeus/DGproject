-- NOTE: το `migrate diff` προτείνει πάντα να ρίξει τα FULLTEXT indexes
-- KnowledgeEntry_fulltext / Task_fulltext — η Prisma δεν τα εκφράζει, οπότε
-- φαίνονται ως μόνιμο drift. Τα χρησιμοποιεί το lib/tickets/similar.ts.

-- AlterTable
ALTER TABLE `Task` ADD COLUMN `visibility` ENUM('internal', 'shared') NOT NULL DEFAULT 'shared';

-- CreateIndex
CREATE INDEX `Task_projectId_visibility_idx` ON `Task`(`projectId`, `visibility`);

