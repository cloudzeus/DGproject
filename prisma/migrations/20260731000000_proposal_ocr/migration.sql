-- AlterTable
ALTER TABLE `ProposalAnalysis` ADD COLUMN `ocrModel` VARCHAR(191) NULL,
    ADD COLUMN `ocrPageCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `ocrTruncated` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `ocrWarning` TEXT NULL;

