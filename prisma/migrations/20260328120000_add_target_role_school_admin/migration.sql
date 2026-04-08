-- AlterTable: add SCHOOL_ADMIN to announcements.targetRole (MySQL ENUM)
ALTER TABLE `announcements` MODIFY COLUMN `targetRole` ENUM('ALL', 'TEACHERS', 'STUDENTS', 'PARENTS', 'SCHOOL_ADMIN') NOT NULL;
