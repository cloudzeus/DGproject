-- NOTE: `prisma migrate diff` also proposed dropping the FULLTEXT indexes
-- `KnowledgeEntry_fulltext` and `Task_fulltext`. Those drops were removed on
-- purpose: Prisma's schema language cannot express MySQL FULLTEXT indexes, so
-- they always read as drift, but they are created by
-- 20260717100246_ticketing_system and queried through $queryRaw MATCH…AGAINST
-- in lib/tickets/similar.ts. Dropping them silently breaks ticket triage.

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `primaryCompanyId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `companyId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Company` (
    `id` VARCHAR(191) NOT NULL,
    `TRDR` INTEGER NULL,
    `SODTYPE` INTEGER NOT NULL DEFAULT 13,
    `CODE` VARCHAR(191) NULL,
    `NAME` VARCHAR(191) NOT NULL,
    `AFM` VARCHAR(191) NULL,
    `IRSDATA` VARCHAR(191) NULL,
    `JOBTYPETRD` VARCHAR(191) NULL,
    `ADDRESS` VARCHAR(191) NULL,
    `ZIP` VARCHAR(191) NULL,
    `DISTRICT` VARCHAR(191) NULL,
    `CITY` VARCHAR(191) NULL,
    `COUNTRY` INTEGER NULL,
    `PHONE01` VARCHAR(191) NULL,
    `PHONE02` VARCHAR(191) NULL,
    `FAX` VARCHAR(191) NULL,
    `EMAIL` VARCHAR(191) NULL,
    `WEBPAGE` VARCHAR(191) NULL,
    `ISACTIVE` INTEGER NOT NULL DEFAULT 1,
    `REMARKS` TEXT NULL,
    `UPDDATE` DATETIME(3) NULL,
    `syncedAt` DATETIME(3) NULL,
    `doyCode` VARCHAR(191) NULL,
    `foundingDate` DATETIME(3) NULL,
    `aadeStatus` VARCHAR(191) NULL,
    `aadeFirmKind` VARCHAR(191) NULL,
    `appLegalForm` VARCHAR(191) NULL,
    `aadeSyncedAt` DATETIME(3) NULL,
    `appNotes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Company_TRDR_key`(`TRDR`),
    INDEX `Company_AFM_idx`(`AFM`),
    INDEX `Company_NAME_idx`(`NAME`),
    INDEX `Company_SODTYPE_ISACTIVE_idx`(`SODTYPE`, `ISACTIVE`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CompanyActivity` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `CompanyActivity_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contact` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `mobile` VARCHAR(191) NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `notes` TEXT NULL,
    `PRSN` INTEGER NULL,
    `TRDBRANCH` INTEGER NULL,
    `LINENUM` INTEGER NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Contact_userId_key`(`userId`),
    INDEX `Contact_companyId_idx`(`companyId`),
    INDEX `Contact_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProjectCompany` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `role` ENUM('partner', 'subcontractor', 'consultant', 'other') NOT NULL,
    `notes` VARCHAR(191) NULL,

    INDEX `ProjectCompany_companyId_idx`(`companyId`),
    UNIQUE INDEX `ProjectCompany_projectId_companyId_key`(`projectId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Project_primaryCompanyId_idx` ON `Project`(`primaryCompanyId`);

-- CreateIndex
CREATE INDEX `User_companyId_idx` ON `User`(`companyId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CompanyActivity` ADD CONSTRAINT `CompanyActivity_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCompany` ADD CONSTRAINT `ProjectCompany_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectCompany` ADD CONSTRAINT `ProjectCompany_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_primaryCompanyId_fkey` FOREIGN KEY (`primaryCompanyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

