-- AlterTable
ALTER TABLE `KnowledgeEntry` ADD COLUMN `isPublic` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `slug` VARCHAR(191) NULL,
    ADD COLUMN `sourceId` VARCHAR(191) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Ticket` ADD COLUMN `resolutionSummary` TEXT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `KnowledgeEntry_slug_key` ON `KnowledgeEntry`(`slug`);

-- CreateIndex
CREATE INDEX `KnowledgeEntry_sourceId_isPublic_idx` ON `KnowledgeEntry`(`sourceId`, `isPublic`);
