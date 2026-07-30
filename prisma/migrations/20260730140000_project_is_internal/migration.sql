-- NOTE: το `migrate diff` προτείνει πάντα να ρίξει τα FULLTEXT indexes
-- KnowledgeEntry_fulltext / Task_fulltext — η Prisma δεν τα εκφράζει, οπότε
-- φαίνονται ως μόνιμο drift. Τα χρησιμοποιεί το lib/tickets/similar.ts.

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `isInternal` BOOLEAN NOT NULL DEFAULT false;

