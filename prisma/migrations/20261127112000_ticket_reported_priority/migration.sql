-- AlterTable
ALTER TABLE `Ticket` ADD COLUMN `priority` ENUM('low', 'medium', 'high', 'urgent') NULL;
