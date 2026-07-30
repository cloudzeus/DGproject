-- AlterTable
ALTER TABLE `Task` ADD COLUMN `generatedFromProposalId` VARCHAR(191) NULL,
    ADD COLUMN `isMilestone` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `proposalConfidence` DOUBLE NULL,
    ADD COLUMN `proposalSourceQuote` TEXT NULL;

-- CreateTable
CREATE TABLE `ProposalAnalysis` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `attachmentId` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `extractedText` LONGTEXT NOT NULL,
    `charCount` INTEGER NOT NULL DEFAULT 0,
    `chunkCount` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('pending', 'analyzing', 'ready', 'failed') NOT NULL DEFAULT 'pending',
    `aiError` TEXT NULL,
    `provider` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `inputTokens` INTEGER NOT NULL DEFAULT 0,
    `outputTokens` INTEGER NOT NULL DEFAULT 0,
    `durationMs` INTEGER NOT NULL DEFAULT 0,
    `summary` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProposalAnalysis_projectId_idx`(`projectId`),
    INDEX `ProposalAnalysis_status_idx`(`status`),
    INDEX `ProposalAnalysis_createdById_idx`(`createdById`),
    INDEX `ProposalAnalysis_status_updatedAt_idx`(`status`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProposalItem` (
    `id` VARCHAR(191) NOT NULL,
    `analysisId` VARCHAR(191) NOT NULL,
    `kind` ENUM('step', 'milestone', 'requirement') NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `suggestedDueDate` DATETIME(3) NULL,
    `suggestedOffsetDays` INTEGER NULL,
    `estimatedHours` DOUBLE NULL,
    `priority` ENUM('low', 'medium', 'high', 'urgent') NULL,
    `visibility` ENUM('internal', 'shared') NOT NULL DEFAULT 'shared',
    `requirementCategory` VARCHAR(191) NULL,
    `sourceQuote` TEXT NULL,
    `confidence` DOUBLE NULL,
    `manual` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('draft', 'rejected', 'converted') NOT NULL DEFAULT 'draft',
    `convertedTaskId` VARCHAR(191) NULL,
    `convertedRequirementId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProposalItem_convertedTaskId_key`(`convertedTaskId`),
    UNIQUE INDEX `ProposalItem_convertedRequirementId_key`(`convertedRequirementId`),
    INDEX `ProposalItem_analysisId_idx`(`analysisId`),
    INDEX `ProposalItem_analysisId_kind_order_idx`(`analysisId`, `kind`, `order`),
    INDEX `ProposalItem_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectRequirement` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(191) NULL,
    `status` ENUM('open', 'covered', 'out_of_scope') NOT NULL DEFAULT 'open',
    `sourceAnalysisId` VARCHAR(191) NULL,
    `sourceQuote` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProjectRequirement_projectId_idx`(`projectId`),
    INDEX `ProjectRequirement_projectId_status_idx`(`projectId`, `status`),
    INDEX `ProjectRequirement_createdById_idx`(`createdById`),
    UNIQUE INDEX `ProjectRequirement_projectId_code_key`(`projectId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskRequirement` (
    `taskId` VARCHAR(191) NOT NULL,
    `requirementId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskRequirement_requirementId_idx`(`requirementId`),
    PRIMARY KEY (`taskId`, `requirementId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Task_generatedFromProposalId_idx` ON `Task`(`generatedFromProposalId`);

-- CreateIndex
CREATE INDEX `Task_projectId_isMilestone_idx` ON `Task`(`projectId`, `isMilestone`);

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_generatedFromProposalId_fkey` FOREIGN KEY (`generatedFromProposalId`) REFERENCES `ProposalAnalysis`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProposalAnalysis` ADD CONSTRAINT `ProposalAnalysis_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProposalAnalysis` ADD CONSTRAINT `ProposalAnalysis_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProposalItem` ADD CONSTRAINT `ProposalItem_analysisId_fkey` FOREIGN KEY (`analysisId`) REFERENCES `ProposalAnalysis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRequirement` ADD CONSTRAINT `ProjectRequirement_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectRequirement` ADD CONSTRAINT `ProjectRequirement_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskRequirement` ADD CONSTRAINT `TaskRequirement_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskRequirement` ADD CONSTRAINT `TaskRequirement_requirementId_fkey` FOREIGN KEY (`requirementId`) REFERENCES `ProjectRequirement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

