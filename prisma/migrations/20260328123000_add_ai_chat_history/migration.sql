-- CreateTable: ai_chat_history (AI Chat History)
CREATE TABLE `ai_chat_history` (
    `chatId` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(50) NOT NULL,
    `schoolId` INTEGER NOT NULL,
    `question` TEXT NOT NULL,
    `aiResponse` TEXT NOT NULL,
    `subject` VARCHAR(100) NULL,
    `language` VARCHAR(20) NOT NULL DEFAULT 'English',
    `sessionId` VARCHAR(100) NULL,
    `tokens` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_chat_history_userId_idx`(`userId`),
    INDEX `ai_chat_history_schoolId_idx`(`schoolId`),
    INDEX `ai_chat_history_sessionId_idx`(`sessionId`),
    INDEX `ai_chat_history_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`chatId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_chat_history` ADD CONSTRAINT `ai_chat_history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_chat_history` ADD CONSTRAINT `ai_chat_history_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`schoolId`) ON DELETE CASCADE ON UPDATE CASCADE;

