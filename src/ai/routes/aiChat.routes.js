// src/ai/routes/aiChat.routes.js

const express = require('express');
const router = express.Router();
const aiChatController = require('../controllers/aiChat.controller');
const { aiChatLimiter } = require('../middleware/aiRateLimit');
const { authenticateToken } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');

// All routes require authentication
router.use(authenticateToken);

// All routes accessible by STUDENT and TEACHER
router.use(requireRole(['STUDENT', 'TEACHER', 'HOMEROOM_TEACHER']));

/**
 * Chat endpoints
 */
router.post('/', aiChatLimiter, aiChatController.askQuestion);
router.get('/history', aiChatController.getChatHistory);
router.get('/stats', aiChatController.getChatStats);
router.get('/session/:sessionId', aiChatController.getSessionHistory);
router.get('/:id', aiChatController.getConversation);
router.delete('/:id', aiChatController.deleteChat);

module.exports = router;
