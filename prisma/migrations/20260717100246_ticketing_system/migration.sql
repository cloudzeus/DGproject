-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('mention', 'assignment', 'due_soon', 'comment', 'status_change', 'question', 'answer', 'approval', 'ticket') NOT NULL;

-- CreateTable
CREATE TABLE `TicketSource` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `secretHash` VARCHAR(191) NOT NULL,
    `originUrls` TEXT NOT NULL,
    `defaultProjectId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TicketSource_code_key`(`code`),
    INDEX `TicketSource_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ticket` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `reporterEmail` VARCHAR(191) NOT NULL,
    `reporterName` VARCHAR(191) NULL,
    `originUrl` TEXT NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `status` ENUM('new', 'analyzing', 'triaged', 'converted', 'resolved', 'closed', 'rejected') NOT NULL DEFAULT 'new',
    `publicToken` VARCHAR(191) NOT NULL,
    `aiTitle` VARCHAR(191) NULL,
    `aiDescription` TEXT NULL,
    `aiCategory` ENUM('bug', 'feature', 'support', 'question', 'billing', 'other') NULL,
    `aiPriority` ENUM('low', 'medium', 'high', 'urgent') NULL,
    `aiSuggestedProjectId` VARCHAR(191) NULL,
    `aiSuggestedAssigneeId` VARCHAR(191) NULL,
    `aiReasoning` TEXT NULL,
    `aiConfidence` DOUBLE NULL,
    `aiError` TEXT NULL,
    `taskId` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Ticket_code_key`(`code`),
    UNIQUE INDEX `Ticket_publicToken_key`(`publicToken`),
    UNIQUE INDEX `Ticket_taskId_key`(`taskId`),
    INDEX `Ticket_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Ticket_sourceId_idx`(`sourceId`),
    INDEX `Ticket_reporterEmail_idx`(`reporterEmail`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketEvent` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `payload` TEXT NULL,
    `actorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketEvent_ticketId_createdAt_idx`(`ticketId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `KnowledgeEntry` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `problem` TEXT NOT NULL,
    `solution` TEXT NOT NULL,
    `tags` TEXT NOT NULL,
    `category` ENUM('bug', 'feature', 'support', 'question', 'billing', 'other') NULL,
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `KnowledgeEntry_ticketId_key`(`ticketId`),
    INDEX `KnowledgeEntry_projectId_idx`(`projectId`),
    INDEX `KnowledgeEntry_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TicketSource` ADD CONSTRAINT `TicketSource_defaultProjectId_fkey` FOREIGN KEY (`defaultProjectId`) REFERENCES `Project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `TicketSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketEvent` ADD CONSTRAINT `TicketEvent_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- FULLTEXT indexes for triage similarity search (queried via $queryRaw MATCH...AGAINST)
CREATE FULLTEXT INDEX `KnowledgeEntry_fulltext` ON `KnowledgeEntry`(`title`, `problem`, `solution`, `tags`);
CREATE FULLTEXT INDEX `Task_fulltext` ON `Task`(`title`, `description`);
