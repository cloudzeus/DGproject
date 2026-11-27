-- Mailgun delivery/open tracking and optional question association for project emails.
ALTER TABLE `EmailMessage`
  ADD COLUMN `questionId` VARCHAR(191) NULL,
  ADD COLUMN `mailgunMessageId` VARCHAR(500) NULL,
  ADD COLUMN `deliveredAt` DATETIME(3) NULL,
  ADD COLUMN `openedAt` DATETIME(3) NULL,
  ADD COLUMN `openCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lastOpenedAt` DATETIME(3) NULL,
  ADD COLUMN `lastEventAt` DATETIME(3) NULL,
  ADD COLUMN `deliveryError` TEXT NULL;

CREATE INDEX `EmailMessage_questionId_idx` ON `EmailMessage`(`questionId`);
CREATE INDEX `EmailMessage_mailgunMessageId_idx` ON `EmailMessage`(`mailgunMessageId`);

ALTER TABLE `EmailMessage`
  ADD CONSTRAINT `EmailMessage_questionId_fkey`
  FOREIGN KEY (`questionId`) REFERENCES `TaskQuestion`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
