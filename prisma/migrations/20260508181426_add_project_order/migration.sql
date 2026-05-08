-- AlterTable
ALTER TABLE `Project` ADD COLUMN `order` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `Project_order_idx` ON `Project`(`order`);
