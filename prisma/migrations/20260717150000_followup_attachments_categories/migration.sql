-- AlterTable
ALTER TABLE `KnowledgeEntry` ADD COLUMN `helpCategoryId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Ticket` ADD COLUMN `mergedIntoId` VARCHAR(191) NULL,
    ADD COLUMN `statusBeforeInfo` ENUM('new', 'analyzing', 'triaged', 'converted', 'resolved', 'closed', 'rejected', 'needs_info', 'merged') NULL,
    MODIFY `status` ENUM('new', 'analyzing', 'triaged', 'converted', 'resolved', 'closed', 'rejected', 'needs_info', 'merged') NOT NULL DEFAULT 'new';

-- CreateTable
CREATE TABLE `HelpCategory` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `HelpCategory_name_key`(`name`),
    UNIQUE INDEX `HelpCategory_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `url` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketAttachment_ticketId_idx`(`ticketId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketMessage` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketMessage_ticketId_createdAt_idx`(`ticketId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `KnowledgeEntry_helpCategoryId_idx` ON `KnowledgeEntry`(`helpCategoryId`);

-- CreateIndex
CREATE INDEX `Ticket_mergedIntoId_idx` ON `Ticket`(`mergedIntoId`);

-- AddForeignKey
ALTER TABLE `KnowledgeEntry` ADD CONSTRAINT `KnowledgeEntry_helpCategoryId_fkey` FOREIGN KEY (`helpCategoryId`) REFERENCES `HelpCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketAttachment` ADD CONSTRAINT `TicketAttachment_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketMessage` ADD CONSTRAINT `TicketMessage_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

