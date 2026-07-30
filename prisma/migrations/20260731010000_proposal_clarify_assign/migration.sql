-- AlterTable
ALTER TABLE `ProposalItem` ADD COLUMN `assigneeId` VARCHAR(191) NULL,
    ADD COLUMN `clarification` TEXT NULL,
    ADD COLUMN `regeneratedFromId` VARCHAR(191) NULL,
    MODIFY `status` ENUM('draft', 'rejected', 'converted', 'replaced') NOT NULL DEFAULT 'draft';

-- CreateIndex
CREATE INDEX `ProposalItem_assigneeId_idx` ON `ProposalItem`(`assigneeId`);

-- CreateIndex
CREATE INDEX `ProposalItem_regeneratedFromId_idx` ON `ProposalItem`(`regeneratedFromId`);

-- AddForeignKey
ALTER TABLE `ProposalItem` ADD CONSTRAINT `ProposalItem_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

