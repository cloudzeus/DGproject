-- CreateTable
CREATE TABLE `UserMailConnection` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `msTenantId` VARCHAR(191) NOT NULL,
    `msObjectId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NOT NULL,
    `refreshToken` TEXT NOT NULL,
    `scopes` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserMailConnection_userId_key`(`userId`),
    INDEX `UserMailConnection_msObjectId_idx`(`msObjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailMessage` (
    `id` VARCHAR(191) NOT NULL,
    `graphMessageId` VARCHAR(191) NULL,
    `internetMessageId` VARCHAR(191) NULL,
    `conversationId` VARCHAR(191) NULL,
    `direction` ENUM('inbound', 'outbound') NOT NULL,
    `status` ENUM('pending', 'analyzed', 'applied', 'ignored', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    `projectId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `subject` TEXT NOT NULL,
    `fromAddress` VARCHAR(191) NOT NULL,
    `toAddresses` TEXT NOT NULL,
    `ccAddresses` TEXT NULL,
    `bodyHtml` LONGTEXT NULL,
    `bodyPreview` TEXT NULL,
    `receivedAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `llmAction` VARCHAR(191) NULL,
    `llmRaw` JSON NULL,
    `appliedNote` TEXT NULL,
    `ingestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmailMessage_internetMessageId_key`(`internetMessageId`),
    INDEX `EmailMessage_projectId_receivedAt_idx`(`projectId`, `receivedAt`),
    INDEX `EmailMessage_projectId_sentAt_idx`(`projectId`, `sentAt`),
    INDEX `EmailMessage_taskId_idx`(`taskId`),
    INDEX `EmailMessage_userId_idx`(`userId`),
    INDEX `EmailMessage_conversationId_idx`(`conversationId`),
    INDEX `EmailMessage_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserMailConnection` ADD CONSTRAINT `UserMailConnection_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailMessage` ADD CONSTRAINT `EmailMessage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailMessage` ADD CONSTRAINT `EmailMessage_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailMessage` ADD CONSTRAINT `EmailMessage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

