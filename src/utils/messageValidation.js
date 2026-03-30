// src/utils/messageValidation.js

/**
 * Validate message data
 */
const validateMessageData = (data) => {
  const errors = [];
  const validRoles = new Set([
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'TEACHER',
    'HOMEROOM_TEACHER',
    'STUDENT',
    'PARENT',
  ]);

  const receiverId =
    data.receiverId != null ? String(data.receiverId).trim() : '';
  if (!receiverId) {
    errors.push('Receiver ID is required');
  }

  const contentStr =
    data.content != null ? String(data.content) : '';
  if (!contentStr.trim()) {
    errors.push('Message content is required');
  }

  if (contentStr.length > 5000) {
    errors.push('Message content cannot exceed 5000 characters');
  }

  if (data.receiverRole != null) {
    const receiverRole = String(data.receiverRole).trim().toUpperCase();
    if (receiverRole && !validRoles.has(receiverRole)) {
      errors.push('Receiver role is invalid');
    }
  }

  return errors;
};

/**
 * Sanitize message content
 */
const sanitizeMessageContent = (content) => {
  return String(content ?? '').trim();
};

module.exports = {
  validateMessageData,
  sanitizeMessageContent,
};
