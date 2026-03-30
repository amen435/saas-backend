-- CreateTable
CREATE TABLE `schools` (
    `schoolId` INTEGER NOT NULL AUTO_INCREMENT,
    `schoolCode` VARCHAR(50) NOT NULL,
    `schoolName` VARCHAR(200) NOT NULL,
    `address` TEXT NULL,
    `city` VARCHAR(100) NULL,
    `country` VARCHAR(100) NOT NULL DEFAULT 'Ethiopia',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `schools_schoolCode_key`(`schoolCode`),
    INDEX `schools_schoolCode_idx`(`schoolCode`),
    PRIMARY KEY (`schoolId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `userId` VARCHAR(50) NOT NULL,
    `username` VARCHAR(100) NULL,
    `email` VARCHAR(100) NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT') NOT NULL,
    `schoolId` INTEGER NULL,
    `classId` INTEGER NULL,
    `fullName` VARCHAR(200) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `failedAttempts` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLogin` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_schoolId_idx`(`schoolId`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_username_idx`(`username`),
    INDEX `users_email_idx`(`email`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classes` (
    `classId` INTEGER NOT NULL AUTO_INCREMENT,
    `schoolId` INTEGER NOT NULL,
    `className` VARCHAR(100) NOT NULL,
    `gradeLevel` INTEGER NOT NULL,
    `section` VARCHAR(10) NULL,
    `homeroomTeacherId` VARCHAR(50) NULL,
    `academicYear` VARCHAR(20) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `classes_schoolId_idx`(`schoolId`),
    INDEX `classes_homeroomTeacherId_idx`(`homeroomTeacherId`),
    UNIQUE INDEX `classes_schoolId_className_academicYear_key`(`schoolId`, `className`, `academicYear`),
    PRIMARY KEY (`classId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`schoolId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `classes`(`classId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `classes` ADD CONSTRAINT `classes_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `schools`(`schoolId`) ON DELETE CASCADE ON UPDATE CASCADE;
