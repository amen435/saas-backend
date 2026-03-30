-- AlterTable
ALTER TABLE `schools` ADD COLUMN `expiryDate` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `schools_isActive_idx` ON `schools`(`isActive`);
