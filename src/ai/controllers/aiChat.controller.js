// src/ai/controllers/aiChat.controller.js

const aiChatService = require('../services/aiChat.service');

/**
 * @route   POST /api/ai/chat
 * @desc    Ask AI tutor a question
 * @access  STUDENT, TEACHER
 */
const askQuestion = async (req, res) => {
  try {
    const { userId, schoolId } = req.user;
    const { question, subject, language, sessionId } = req.body;

    if (!question || question.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Question is required',
      });
    }

    const chat = await aiChatService.askQuestion(
      userId,
      schoolId,
      question.trim(),
      subject,
      language || 'English',
      sessionId
    );

    res.status(201).json({
      success: true,
      message: 'Question answered successfully',
      data: chat,
    });
  } catch (error) {
    console.error('AI chat error:', error);

    const message = String(error?.message || '');

    if (error.message.includes('not available')) {
      return res.status(503).json({
        success: false,
        error: 'AI service is currently unavailable',
      });
    }

    if (message?.startsWith('Gemini model ')) {
      return res.status(503).json({
        success: false,
        error: message,
      });
    }

    if (
      message.includes('Invalid Gemini API key') ||
      message.includes('Gemini API not configured') ||
      message.includes('Gemini API not configured.')
    ) {
      return res.status(503).json({
        success: false,
        error: message,
      });
    }

    if (message.toLowerCase().includes('quota exceeded')) {
      return res.status(429).json({
        success: false,
        error: message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process question',
    });
  }
};

/**
 * @route   GET /api/ai/chat/history
 * @desc    Get chat history
 * @access  STUDENT, TEACHER
 */
const getChatHistory = async (req, res) => {
  try {
    const { userId, schoolId } = req.user;
    const { subject, sessionId, startDate, endDate, limit } = req.query;

    const history = await aiChatService.getChatHistory(userId, schoolId, {
      subject,
      sessionId,
      startDate,
      endDate,
      limit: parseInt(limit) || 50,
    });

    res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chat history',
    });
  }
};

/**
 * @route   GET /api/ai/chat/:id
 * @desc    Get specific conversation
 * @access  STUDENT, TEACHER
 */
const getConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, schoolId } = req.user;

    const chat = await aiChatService.getConversation(
      parseInt(id),
      userId,
      schoolId
    );

    res.status(200).json({
      success: true,
      data: chat,
    });
  } catch (error) {
    console.error('Get conversation error:', error);

    if (error.message === 'Chat not found') {
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
 * @route   GET /api/ai/chat/session/:sessionId
 * @desc    Get full session history
 * @access  STUDENT, TEACHER
 */
const getSessionHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, schoolId } = req.user;

    const chats = await aiChatService.getSessionHistory(sessionId, userId, schoolId);

    res.status(200).json({
      success: true,
      count: chats.length,
      data: chats,
    });
  } catch (error) {
    console.error('Get session history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session history',
    });
  }
};

/**
 * @route   DELETE /api/ai/chat/:id
 * @desc    Delete chat
 * @access  STUDENT, TEACHER
 */
const deleteChat = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, schoolId } = req.user;

    const deleted = await aiChatService.deleteChat(
      parseInt(id),
      userId,
      schoolId
    );

    res.status(200).json({
      success: true,
      message: 'Chat deleted successfully',
      data: deleted,
    });
  } catch (error) {
    console.error('Delete chat error:', error);

    if (error.message === 'Chat not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete chat',
    });
  }
};

/**
 * @route   GET /api/ai/chat/stats
 * @desc    Get chat statistics
 * @access  STUDENT, TEACHER
 */
const getChatStats = async (req, res) => {
  try {
    const { userId, schoolId } = req.user;

    const stats = await aiChatService.getChatStats(userId, schoolId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get chat stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
    });
  }
};

module.exports = {
  askQuestion,
  getChatHistory,
  getConversation,
  getSessionHistory,
  deleteChat,
  getChatStats,
};
