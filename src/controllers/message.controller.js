// src/controllers/message.controller.js

const messageService = require('../services/message.service');
const { validateMessageData, sanitizeMessageContent } = require('../utils/messageValidation');

/**
 * @route   POST /api/messages
 * @desc    Send a message
 * @access  Authenticated users
 */
/**
 * @route   GET /api/messages/contacts
 * @desc    List users you can message (role-based)
 */
const getMessagingContacts = async (req, res) => {
  try {
    const { schoolId, userId, activeRole, role } = req.user;
    const contacts = await messageService.getMessagingContacts(
      userId,
      schoolId,
      activeRole || role
    );
    res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts,
    });
  } catch (error) {
    console.error('Get messaging contacts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load contacts',
    });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { receiverId, content } = req.body;

    // Validate input
    const errors = validateMessageData({ receiverId, content });
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    // Sanitize content
    const sanitizedContent = sanitizeMessageContent(content);
    const toId = String(receiverId).trim();

    const message = await messageService.sendMessage(
      userId,
      toId,
      sanitizedContent,
      schoolId
    );

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message,
    });
  } catch (error) {
    console.error('Send message error:', error);

    if (error.message.includes('not found') || error.message.includes('Cannot send')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to send message',
    });
  }
};

/**
 * @route   GET /api/messages/conversation/:userId
 * @desc    Get conversation with a specific user
 * @access  Authenticated users
 */
const getConversation = async (req, res) => {
  try {
    const { userId: otherUserId } = req.params;
    const { schoolId, userId } = req.user;
    const { limit } = req.query;

    const messages = await messageService.getConversation(
      userId,
      otherUserId,
      schoolId,
      limit ? parseInt(limit, 10) : 50
    );

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
    });
  } catch (error) {
    console.error('Get conversation error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation',
    });
  }
};

/**
 * @route   PUT /api/messages/read/:senderId
 * @desc    Mark all messages from a sender as read
 * @access  Authenticated users
 */
const markMessagesAsRead = async (req, res) => {
  try {
    const { senderId } = req.params;
    const { schoolId, userId } = req.user;

    const result = await messageService.markMessagesAsRead(
      userId,
      senderId,
      schoolId
    );

    res.status(200).json({
      success: true,
      message: `${result.count} message(s) marked as read`,
      data: {
        updatedCount: result.count,
      },
    });
  } catch (error) {
    console.error('Mark messages as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark messages as read',
    });
  }
};

/**
 * @route   PUT /api/messages/:messageId/read
 * @desc    Mark single message as read
 * @access  Authenticated users
 */
const markMessageAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { schoolId, userId } = req.user;

    const message = await messageService.markMessageAsRead(
      parseInt(messageId),
      userId,
      schoolId
    );

    res.status(200).json({
      success: true,
      message: 'Message marked as read',
      data: message,
    });
  } catch (error) {
    console.error('Mark message as read error:', error);

    if (error.message.includes('not found') || error.message.includes('not the receiver')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to mark message as read',
    });
  }
};

/**
 * @route   GET /api/messages/conversations
 * @desc    Get recent conversations
 * @access  Authenticated users
 */
const getRecentConversations = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;

    const conversations = await messageService.getRecentConversations(
      userId,
      schoolId
    );

    res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations,
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversations',
    });
  }
};

/**
 * @route   GET /api/messages/unread-count
 * @desc    Get unread message count
 * @access  Authenticated users
 */
const getUnreadCount = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;

    const count = await messageService.getUnreadCount(userId, schoolId);

    res.status(200).json({
      success: true,
      data: {
        unreadCount: count,
      },
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count',
    });
  }
};

/**
 * @route   DELETE /api/messages/:messageId
 * @desc    Delete a message
 * @access  Authenticated users (sender only)
 */
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { schoolId, userId } = req.user;

    const result = await messageService.deleteMessage(
      parseInt(messageId),
      userId,
      schoolId
    );

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully',
      data: result,
    });
  } catch (error) {
    console.error('Delete message error:', error);

    if (error.message.includes('not found') || error.message.includes('not the sender')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete message',
    });
  }
};

/**
 * @route   GET /api/messages/search
 * @desc    Search messages
 * @access  Authenticated users
 */
const searchMessages = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { q } = req.query;

    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    const messages = await messageService.searchMessages(
      userId,
      q.trim(),
      schoolId
    );

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
    });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search messages',
    });
  }
};

module.exports = {
  getMessagingContacts,
  sendMessage,
  getConversation,
  markMessagesAsRead,
  markMessageAsRead,
  getRecentConversations,
  getUnreadCount,
  deleteMessage,
  searchMessages,
};
