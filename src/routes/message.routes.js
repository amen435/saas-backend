// src/routes/message.routes.js

const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * Send Message
 */
router.post(
  '/',
  messageController.sendMessage
);

/**
 * New-chat recipients (role-based)
 */
router.get(
  '/contacts',
  messageController.getMessagingContacts
);

/**
 * Get Conversations
 */
router.get(
  '/conversations',
  messageController.getRecentConversations
);

router.get(
  '/conversation/:userId',
  messageController.getConversation
);

/**
 * Unread Count
 */
router.get(
  '/unread-count',
  messageController.getUnreadCount
);

/**
 * Search
 */
router.get(
  '/search',
  messageController.searchMessages
);

/**
 * Mark as Read
 */
router.put(
  '/read/:senderId',
  messageController.markMessagesAsRead
);

router.put(
  '/:messageId/read',
  messageController.markMessageAsRead
);

/**
 * Delete
 */
router.delete(
  '/:messageId',
  messageController.deleteMessage
);

module.exports = router;