-- AlterTable
ALTER TABLE `Notification` MODIFY `type` ENUM('mention', 'assignment', 'due_soon', 'comment', 'status_change', 'question', 'answer') NOT NULL;

-- CreateTable
CREATE TABLE `TaskQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `askedById` VARCHAR(191) NOT NULL,
    `askedToId` VARCHAR(191) NOT NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NULL,
    `answeredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TaskQuestion_taskId_idx`(`taskId`),
    INDEX `TaskQuestion_askedById_idx`(`askedById`),
    INDEX `TaskQuestion_askedToId_idx`(`askedToId`),
    INDEX `TaskQuestion_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TaskQuestionAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `kind` ENUM('question', 'answer') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` TEXT NULL,
    `size` INTEGER NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `url` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TaskQuestionAttachment_questionId_idx`(`questionId`),
    INDEX `TaskQuestionAttachment_uploadedById_idx`(`uploadedById`),
    INDEX `TaskQuestionAttachment_kind_idx`(`kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TaskQuestion` ADD CONSTRAINT `TaskQuestion_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskQuestion` ADD CONSTRAINT `TaskQuestion_askedById_fkey` FOREIGN KEY (`askedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskQuestion` ADD CONSTRAINT `TaskQuestion_askedToId_fkey` FOREIGN KEY (`askedToId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskQuestionAttachment` ADD CONSTRAINT `TaskQuestionAttachment_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `TaskQuestion`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TaskQuestionAttachment` ADD CONSTRAINT `TaskQuestionAttachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
