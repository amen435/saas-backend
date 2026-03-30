// src/ai/services/aiChat.service.js

const prisma = require('../../config/database');
const geminiService = require('./gemini.service');
const { tutorPrompt } = require('../utils/promptTemplates');

class AiChatService {
  /**
   * Send question to AI tutor
   */
  async askQuestion(userId, schoolId, question, subject, language = 'English', sessionId = null) {
    if (!geminiService.isAvailable()) {
      throw new Error('AI service is not available');
    }

    // Generate AI response
    const prompt = tutorPrompt(question, subject, language);
    const result = await geminiService.generateContent(prompt);

    const effectiveSessionId = sessionId || this.generateSessionId();

    // Save to database (best-effort; don't break chat if history table/migrations are missing)
    try {
      const chat = await prisma.aiChatHistory.create({
        data: {
          userId,
          schoolId,
          question,
          aiResponse: result.text,
          subject: subject || null,
          language,
          sessionId: effectiveSessionId,
          tokens: result.tokens,
        },
        include: {
          user: {
            select: {
              userId: true,
              fullName: true,
              role: true,
            },
          },
        },
      });

      return chat;
    } catch (error) {
      const code = error?.code;
      const msg = String(error?.message || '');

      // Prisma: P2021 = table does not exist
      const missingHistoryTable =
        code === 'P2021' ||
        msg.toLowerCase().includes('ai_chat_history') ||
        msg.toLowerCase().includes('aichathistory') ||
        msg.toLowerCase().includes('does not exist');

      if (missingHistoryTable) {
        console.warn(
          'AI chat history not persisted (missing table/migration). Returning response without saving.',
          { code }
        );

        return {
          chatId: null,
          userId,
          schoolId,
          question,
          aiResponse: result.text,
          subject: subject || null,
          language,
          sessionId: effectiveSessionId,
          tokens: result.tokens,
          createdAt: new Date(),
        };
      }

      throw error;
    }
  }

  /**
   * Get user's chat history
   */
  async getChatHistory(userId, schoolId, filters = {}) {
    const where = {
      userId,
      schoolId,
    };

    if (filters.subject) {
      where.subject = filters.subject;
    }

    if (filters.sessionId) {
      where.sessionId = filters.sessionId;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const history = await prisma.aiChatHistory.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: filters.limit || 50,
    });

    return history;
  }

  /**
   * Get specific conversation
   */
  async getConversation(chatId, userId, schoolId) {
    const chat = await prisma.aiChatHistory.findFirst({
      where: {
        chatId,
        userId,
        schoolId,
      },
      include: {
        user: {
          select: {
            fullName: true,
          },
        },
      },
    });

    if (!chat) {
      throw new Error('Chat not found');
    }

    return chat;
  }

  /**
   * Get conversation by session
   */
  async getSessionHistory(sessionId, userId, schoolId) {
    const chats = await prisma.aiChatHistory.findMany({
      where: {
        sessionId,
        userId,
        schoolId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return chats;
  }

  /**
   * Delete chat history
   */
  async deleteChat(chatId, userId, schoolId) {
    const chat = await prisma.aiChatHistory.findFirst({
      where: {
        chatId,
        userId,
        schoolId,
      },
    });

    if (!chat) {
      throw new Error('Chat not found');
    }

    await prisma.aiChatHistory.delete({
      where: { chatId },
    });

    return chat;
  }

  /**
   * Get chat statistics
   */
  async getChatStats(userId, schoolId) {
    const total = await prisma.aiChatHistory.count({
      where: { userId, schoolId },
    });

    const bySubject = await prisma.aiChatHistory.groupBy({
      by: ['subject'],
      where: { userId, schoolId },
      _count: true,
    });

    const totalTokens = await prisma.aiChatHistory.aggregate({
      where: { userId, schoolId },
      _sum: {
        tokens: true,
      },
    });

    return {
      totalQuestions: total,
      bySubject: bySubject.map(s => ({
        subject: s.subject || 'General',
        count: s._count,
      })),
      totalTokens: totalTokens._sum.tokens || 0,
    };
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = new AiChatService();
