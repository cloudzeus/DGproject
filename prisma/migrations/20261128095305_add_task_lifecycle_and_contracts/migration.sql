-- AlterTable
ALTER TABLE `Task` ADD COLUMN `billableHours` DOUBLE NULL,
    MODIFY `status` ENUM('backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled') NOT NULL DEFAULT 'todo';

-- CreateTable
CREATE TABLE `ProjectContract` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `attachmentId` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `extractedText` LONGTEXT NOT NULL,
    `charCount` INTEGER NOT NULL DEFAULT 0,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProjectContract_projectId_key`(`projectId`),
    UNIQUE INDEX `ProjectContract_attachmentId_key`(`attachmentId`),
    INDEX `ProjectContract_uploadedById_idx`(`uploadedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskContractCheck` (
    `id` VARCHAR(191) NOT NULL,
    `contractId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `coverage` ENUM('covered', 'partial', 'not_found', 'unclear') NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `evidence` TEXT NULL,
    `explanation` TEXT NOT NULL,
    `checkedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskContractCheck_taskId_idx`(`taskId`),
    INDEX `TaskContractCheck_checkedById_idx`(`checkedById`),
    UNIQUE INDEX `TaskContractCheck_contractId_taskId_key`(`contractId`, `taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectContract` ADD CONSTRAINT `ProjectContract_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectContract` ADD CONSTRAINT `ProjectContract_attachmentId_fkey` FOREIGN KEY (`attachmentId`) REFERENCES `Attachment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectContract` ADD CONSTRAINT `ProjectContract_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskContractCheck` ADD CONSTRAINT `TaskContractCheck_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `ProjectContract`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskContractCheck` ADD CONSTRAINT `TaskContractCheck_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskContractCheck` ADD CONSTRAINT `TaskContractCheck_checkedById_fkey` FOREIGN KEY (`checkedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

