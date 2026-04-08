ALTER TABLE `messages`
  ADD COLUMN `receiverRole` ENUM(
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'TEACHER',
    'HOMEROOM_TEACHER',
    'STUDENT',
    'PARENT'
  ) NULL AFTER `receiverId`;

UPDATE `messages` AS `m`
JOIN `users` AS `u` ON `u`.`userId` = `m`.`receiverId`
SET `m`.`receiverRole` = `u`.`role`
WHERE `m`.`receiverRole` IS NULL;

CREATE INDEX `messages_receiverRole_idx` ON `messages`(`receiverRole`);
