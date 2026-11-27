-- Declared implementation stack used as factual context in AI ticket proposals.
ALTER TABLE `Project`
  ADD COLUMN `technologyStack` TEXT NULL;

-- Preserve secondary tasks as merge history instead of deleting them.
ALTER TABLE `Task`
  ADD COLUMN `mergedIntoId` VARCHAR(191) NULL;

CREATE INDEX `Task_mergedIntoId_idx` ON `Task`(`mergedIntoId`);

ALTER TABLE `Task`
  ADD CONSTRAINT `Task_mergedIntoId_fkey`
  FOREIGN KEY (`mergedIntoId`) REFERENCES `Task`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `TaskMergeProposal` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `primaryTaskId` VARCHAR(191) NOT NULL,
  `taskIds` JSON NOT NULL,
  `taskSnapshots` JSON NOT NULL,
  `suggestedTitle` VARCHAR(191) NOT NULL,
  `suggestedDescription` TEXT NOT NULL,
  `rationale` TEXT NOT NULL,
  `confidence` DOUBLE NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected', 'superseded') NOT NULL DEFAULT 'pending',
  `explanation` LONGTEXT NULL,
  `recipients` JSON NULL,
  `emailSentTo` JSON NULL,
  `emailSentAt` DATETIME(3) NULL,
  `emailError` TEXT NULL,
  `provider` VARCHAR(191) NULL,
  `model` VARCHAR(191) NULL,
  `inputTokens` INTEGER NOT NULL DEFAULT 0,
  `outputTokens` INTEGER NOT NULL DEFAULT 0,
  `createdById` VARCHAR(191) NOT NULL,
  `reviewedById` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `TaskMergeProposal_projectId_status_idx`(`projectId`, `status`),
  INDEX `TaskMergeProposal_primaryTaskId_idx`(`primaryTaskId`),
  INDEX `TaskMergeProposal_createdById_idx`(`createdById`),
  INDEX `TaskMergeProposal_reviewedById_idx`(`reviewedById`),
  INDEX `TaskMergeProposal_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TaskMergeProposal`
  ADD CONSTRAINT `TaskMergeProposal_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskMergeProposal`
  ADD CONSTRAINT `TaskMergeProposal_primaryTaskId_fkey`
  FOREIGN KEY (`primaryTaskId`) REFERENCES `Task`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskMergeProposal`
  ADD CONSTRAINT `TaskMergeProposal_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskMergeProposal`
  ADD CONSTRAINT `TaskMergeProposal_reviewedById_fkey`
  FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
