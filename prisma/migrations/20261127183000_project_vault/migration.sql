CREATE TABLE `VaultSecret` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `category` ENUM('api_key', 'connection_string', 'credential', 'other') NOT NULL,
  `environment` ENUM('development', 'staging', 'production', 'other') NOT NULL DEFAULT 'other',
  `ciphertext` LONGTEXT NOT NULL,
  `iv` VARCHAR(191) NOT NULL,
  `authTag` VARCHAR(191) NOT NULL,
  `keyVersion` VARCHAR(32) NOT NULL DEFAULT 'v1',
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `VaultSecret_projectId_label_environment_key`(`projectId`, `label`, `environment`),
  INDEX `VaultSecret_projectId_idx`(`projectId`),
  INDEX `VaultSecret_createdById_idx`(`createdById`),
  INDEX `VaultSecret_updatedById_idx`(`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VaultAccessGrant` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `grantedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `VaultAccessGrant_projectId_userId_key`(`projectId`, `userId`),
  INDEX `VaultAccessGrant_userId_idx`(`userId`),
  INDEX `VaultAccessGrant_grantedById_idx`(`grantedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VaultOtpChallenge` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `secretId` VARCHAR(191) NOT NULL,
  `codeHash` VARCHAR(64) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `lastAttemptAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `VaultOtpChallenge_userId_secretId_createdAt_idx`(`userId`, `secretId`, `createdAt`),
  INDEX `VaultOtpChallenge_expiresAt_idx`(`expiresAt`),
  INDEX `VaultOtpChallenge_secretId_idx`(`secretId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VaultAuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `secretId` VARCHAR(191) NULL,
  `actorId` VARCHAR(191) NULL,
  `action` ENUM('created', 'updated', 'deleted', 'otp_requested', 'revealed', 'reveal_failed', 'access_granted', 'access_revoked') NOT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `VaultAuditLog_projectId_createdAt_idx`(`projectId`, `createdAt`),
  INDEX `VaultAuditLog_secretId_idx`(`secretId`),
  INDEX `VaultAuditLog_actorId_idx`(`actorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VaultSecret`
  ADD CONSTRAINT `VaultSecret_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VaultSecret`
  ADD CONSTRAINT `VaultSecret_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VaultSecret`
  ADD CONSTRAINT `VaultSecret_updatedById_fkey`
  FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VaultAccessGrant`
  ADD CONSTRAINT `VaultAccessGrant_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VaultAccessGrant`
  ADD CONSTRAINT `VaultAccessGrant_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VaultAccessGrant`
  ADD CONSTRAINT `VaultAccessGrant_grantedById_fkey`
  FOREIGN KEY (`grantedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VaultOtpChallenge`
  ADD CONSTRAINT `VaultOtpChallenge_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VaultOtpChallenge`
  ADD CONSTRAINT `VaultOtpChallenge_secretId_fkey`
  FOREIGN KEY (`secretId`) REFERENCES `VaultSecret`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VaultAuditLog`
  ADD CONSTRAINT `VaultAuditLog_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VaultAuditLog`
  ADD CONSTRAINT `VaultAuditLog_secretId_fkey`
  FOREIGN KEY (`secretId`) REFERENCES `VaultSecret`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VaultAuditLog`
  ADD CONSTRAINT `VaultAuditLog_actorId_fkey`
  FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
