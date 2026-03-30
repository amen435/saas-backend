// src/ai/middleware/aiRateLimit.js

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for AI chat endpoints
 */
const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE) || 10,
  message: {
    success: false,
    error: 'Too many AI requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for homework generation
 */
const aiHomeworkLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 homework generations per minute
  message: {
    success: false,
    error: 'Too many homework generation requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  aiChatLimiter,
  aiHomeworkLimiter,
};