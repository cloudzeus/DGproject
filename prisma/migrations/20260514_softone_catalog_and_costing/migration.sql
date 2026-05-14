-- Local cache of the SoftOne ITEM/MTRL catalog + per-project costing lines.
-- See prisma/schema.prisma SoftoneItem & ProjectCostLine for field-level docs.

-- ─── SoftoneItem ────────────────────────────────────────────────────
CREATE TABLE `SoftoneItem` (
    `mtrl`              INTEGER         NOT NULL,
    `code`              VARCHAR(191)    NOT NULL,
    `code1`             VARCHAR(191)    NULL,
    `code2`             VARCHAR(191)    NULL,
    `name`              TEXT            NOT NULL,
    `name1`             TEXT            NULL,
    `kind`              ENUM('product', 'service') NOT NULL,
    `mtrType`           INTEGER         NOT NULL,
    `unitPrice`         DOUBLE          NOT NULL DEFAULT 0,
    `retailPrice`       DOUBLE          NULL,
    `wholesalePrice`    DOUBLE          NULL,
    `vatRate`           DOUBLE          NULL,
    `vatId`             INTEGER         NULL,
    `unitId`            INTEGER         NULL,
    `unitName`          VARCHAR(191)    NULL,
    `groupId`           INTEGER         NULL,
    `groupName`         VARCHAR(191)    NULL,
    `brandId`           INTEGER         NULL,
    `brandName`         VARCHAR(191)    NULL,
    `manufacturerId`    INTEGER         NULL,
    `manufacturerName`  VARCHAR(191)    NULL,
    `isActive`          BOOLEAN         NOT NULL DEFAULT TRUE,
    `remarks`           TEXT            NULL,
    `lastSyncedAt`      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`         DATETIME(3)     NOT NULL,

    PRIMARY KEY (`mtrl`),
    INDEX `SoftoneItem_kind_idx` (`kind`),
    INDEX `SoftoneItem_isActive_idx` (`isActive`),
    INDEX `SoftoneItem_code_idx` (`code`),
    INDEX `SoftoneItem_groupId_idx` (`groupId`),
    INDEX `SoftoneItem_brandId_idx` (`brandId`),
    INDEX `SoftoneItem_lastSyncedAt_idx` (`lastSyncedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── ProjectCostLine ────────────────────────────────────────────────
CREATE TABLE `ProjectCostLine` (
    `id`                VARCHAR(191)    NOT NULL,
    `projectId`         VARCHAR(191)    NOT NULL,
    `softoneItemMtrl`   INTEGER         NOT NULL,
    `kind`              ENUM('product', 'service') NOT NULL,
    `quantity`          DOUBLE          NOT NULL DEFAULT 1,
    `unitPriceSnapshot` DOUBLE          NOT NULL,
    `vatRateSnapshot`   DOUBLE          NULL,
    `notes`             TEXT            NULL,
    `createdById`       VARCHAR(191)    NOT NULL,
    `createdAt`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`         DATETIME(3)     NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `ProjectCostLine_projectId_idx` (`projectId`),
    INDEX `ProjectCostLine_softoneItemMtrl_idx` (`softoneItemMtrl`),
    INDEX `ProjectCostLine_kind_idx` (`kind`),
    INDEX `ProjectCostLine_createdById_idx` (`createdById`),
    INDEX `ProjectCostLine_createdAt_idx` (`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProjectCostLine`
    ADD CONSTRAINT `ProjectCostLine_projectId_fkey`
        FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `ProjectCostLine_softoneItemMtrl_fkey`
        FOREIGN KEY (`softoneItemMtrl`) REFERENCES `SoftoneItem`(`mtrl`)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `ProjectCostLine_createdById_fkey`
        FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE;
