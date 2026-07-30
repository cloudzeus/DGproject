-- NOTE: το `migrate diff` προτείνει πάντα να ρίξει τα FULLTEXT indexes
-- KnowledgeEntry_fulltext / Task_fulltext — η Prisma δεν τα εκφράζει, οπότε
-- φαίνονται ως μόνιμο drift. Τα χρησιμοποιεί το lib/tickets/similar.ts.

-- AlterTable
ALTER TABLE `ProjectMember` ADD COLUMN `responsibilities` TEXT NULL,
    ADD COLUMN `title` VARCHAR(191) NULL,
    ADD COLUMN `visibleToCustomer` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `mobile` VARCHAR(191) NULL,
    ADD COLUMN `phone` VARCHAR(191) NULL;

