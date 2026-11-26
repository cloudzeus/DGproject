-- AlterTable
ALTER TABLE `User`
  ADD COLUMN `isAIAgent` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `agentKey` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Task`
  ADD COLUMN `activeAIAgentId` VARCHAR(191) NULL,
  ADD COLUMN `aiBlockedReason` TEXT NULL;

-- CreateTable
CREATE TABLE `TaskResolution` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `changes` JSON NOT NULL,
    `commits` JSON NOT NULL,
    `testResults` JSON NOT NULL,
    `artifacts` JSON NOT NULL,
    `remainingIssues` TEXT NULL,
    `status` ENUM('submitted', 'changes_requested', 'approved') NOT NULL DEFAULT 'submitted',
    `reviewFeedback` TEXT NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaskResolution_taskId_submittedAt_idx`(`taskId`, `submittedAt`),
    INDEX `TaskResolution_agentId_idx`(`agentId`),
    INDEX `TaskResolution_reviewedById_idx`(`reviewedById`),
    INDEX `TaskResolution_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `User_agentKey_key` ON `User`(`agentKey`);

-- CreateIndex
CREATE INDEX `Task_activeAIAgentId_idx` ON `Task`(`activeAIAgentId`);

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_activeAIAgentId_fkey` FOREIGN KEY (`activeAIAgentId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskResolution` ADD CONSTRAINT `TaskResolution_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskResolution` ADD CONSTRAINT `TaskResolution_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskResolution` ADD CONSTRAINT `TaskResolution_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
