-- Add follow-up threading to TaskQuestion
ALTER TABLE `TaskQuestion` ADD COLUMN `parentId` VARCHAR(191) NULL;

-- Index for fast lookup of follow-ups by parent
CREATE INDEX `TaskQuestion_parentId_idx` ON `TaskQuestion`(`parentId`);

-- Self-referential foreign key. ON DELETE CASCADE so removing a root question
-- removes its entire follow-up subtree.
ALTER TABLE `TaskQuestion` ADD CONSTRAINT `TaskQuestion_parentId_fkey`
  FOREIGN KEY (`parentId`) REFERENCES `TaskQuestion`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
