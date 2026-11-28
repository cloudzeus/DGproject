CREATE TABLE `TaskRequester` (
  `id` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `TaskRequester_taskId_userId_key`(`taskId`, `userId`),
  INDEX `TaskRequester_taskId_idx`(`taskId`),
  INDEX `TaskRequester_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TaskWatcher` (
  `id` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `TaskWatcher_taskId_userId_key`(`taskId`, `userId`),
  INDEX `TaskWatcher_taskId_idx`(`taskId`),
  INDEX `TaskWatcher_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve existing productivity attribution: the historical creator becomes
-- the initial requester, while createdById remains the audit trail.
INSERT IGNORE INTO `TaskRequester` (`id`, `taskId`, `userId`, `createdAt`)
SELECT UUID(), `id`, `createdById`, `createdAt` FROM `Task`;

ALTER TABLE `TaskRequester`
  ADD CONSTRAINT `TaskRequester_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskRequester`
  ADD CONSTRAINT `TaskRequester_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskWatcher`
  ADD CONSTRAINT `TaskWatcher_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TaskWatcher`
  ADD CONSTRAINT `TaskWatcher_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
