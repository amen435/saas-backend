// src/routes/message.routes.js

const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/rbac.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * Send Message
 */
router.post(
  '/',
  requireAnyPermission(['messages:write']),
  auditAuthorizedAccess('messages.write.send'),
  messageController.sendMessage
);

/**
 * New-chat recipients (role-based)
 */
router.get(
  '/contacts',
  requireAnyPermission(['messages:read']),
  auditAuthorizedAccess('messages.read.contacts'),
  messageController.getMessagingContacts
);

/**
 * Get Conversations
 */
router.get(
  '/conversations',
  requireAnyPermission(['messages:read']),
  auditAuthorizedAccess('messages.read.conversations'),
  messageController.getRecentConversations
);

router.get(
  '/conversation/:userId',
  requireAnyPermission(['messages:read']),
  auditAuthorizedAccess('messages.read.conversation'),
  messageController.getConversation
);

/**
 * Unread Count
 */
router.get(
  '/unread-count',
  requireAnyPermission(['messages:read']),
  auditAuthorizedAccess('messages.read.unread_count'),
  messageController.getUnreadCount
);

/**
 * Search
 */
router.get(
  '/search',
  requireAnyPermission(['messages:read']),
  auditAuthorizedAccess('messages.read.search'),
  messageController.searchMessages
);

/**
 * Mark as Read
 */
router.put(
  '/read/:senderId',
  requireAnyPermission(['messages:write']),
  auditAuthorizedAccess('messages.write.mark_sender_read'),
  messageController.markMessagesAsRead
);

router.put(
  '/:messageId/read',
  requireAnyPermission(['messages:write']),
  auditAuthorizedAccess('messages.write.mark_message_read'),
  messageController.markMessageAsRead
);

/**
 * Delete
 */
router.delete(
  '/:messageId',
  requireAnyPermission(['messages:write']),
  auditAuthorizedAccess('messages.write.delete'),
  messageController.deleteMessage
);

module.exports = router;