-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('mention', 'assignment', 'due_soon', 'comment', 'status_change', 'question', 'answer', 'approval') NOT NULL;

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `approverId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Project_approverId_idx` ON `Project`(`approverId`);

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

