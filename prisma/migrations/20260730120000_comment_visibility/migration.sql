-- NOTE: το `prisma migrate diff` προτείνει να ρίξει τα FULLTEXT indexes
-- `KnowledgeEntry_fulltext` και `Task_fulltext`. ΜΗΝ το κάνεις. Δημιουργούνται
-- από 20260717100246_ticketing_system και χρησιμοποιούνται από το
-- lib/tickets/similar.ts μέσω $queryRaw MATCH…AGAINST. Η Prisma δεν εκφράζει
-- MySQL FULLTEXT indexes, γι' αυτό εμφανίζονται μόνιμα ως drift σε κάθε diff.

-- AlterTable
ALTER TABLE `Comment` ADD COLUMN `visibility` ENUM('internal', 'shared') NOT NULL DEFAULT 'internal';

-- CreateIndex
CREATE INDEX `Comment_taskId_visibility_idx` ON `Comment`(`taskId`, `visibility`);

