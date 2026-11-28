CREATE TABLE `VaultSecretShare` (
  `id` VARCHAR(191) NOT NULL,
  `secretId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `sharedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `VaultSecretShare_secretId_userId_key`(`secretId`, `userId`),
  INDEX `VaultSecretShare_userId_idx`(`userId`),
  INDEX `VaultSecretShare_sharedById_idx`(`sharedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Preserve the old explicit project-level grants as per-secret shares.
INSERT IGNORE INTO `VaultSecretShare` (`id`, `secretId`, `userId`, `sharedById`, `createdAt`)
SELECT UUID(), `secret`.`id`, `grant`.`userId`, `grant`.`grantedById`, `grant`.`createdAt`
FROM `VaultAccessGrant` `grant`
INNER JOIN `VaultSecret` `secret` ON `secret`.`projectId` = `grant`.`projectId`;

DROP TABLE `VaultAccessGrant`;

-- Different users may use the same label inside their own vault in a project.
DROP INDEX `VaultSecret_projectId_label_environment_key` ON `VaultSecret`;
CREATE UNIQUE INDEX `VaultSecret_projectId_createdById_label_environment_key`
  ON `VaultSecret`(`projectId`, `createdById`, `label`, `environment`);

ALTER TABLE `VaultSecretShare`
  ADD CONSTRAINT `VaultSecretShare_secretId_fkey`
  FOREIGN KEY (`secretId`) REFERENCES `VaultSecret`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VaultSecretShare`
  ADD CONSTRAINT `VaultSecretShare_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VaultSecretShare`
  ADD CONSTRAINT `VaultSecretShare_sharedById_fkey`
  FOREIGN KEY (`sharedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
