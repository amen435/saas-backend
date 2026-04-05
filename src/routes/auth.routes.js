// src/routes/auth.routes.js

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const rateLimit = require('express-rate-limit');

// ============================================
// RATE LIMITER FOR LOGIN (Prevent Brute Force)
// ============================================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 requests per windowMs
  message: {
    success: false,
    error: 'Too many login attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

// ============================================
// PUBLIC ROUTES
// ============================================

/**
 * Browsers open URLs with GET. Login is POST-only; return 405 so health checks are not confused with "missing route".
 */
router.get('/login', (req, res) => {
  res.setHeader('Allow', 'POST');
  return res.status(405).json({
    success: false,
    error: 'Method Not Allowed',
    hint: 'Use POST /api/auth/login with JSON body: { "username", "password", "schoolId" }.',
  });
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user with username and password
 * @access  Public
 */
router.post('/login', loginLimiter, authController.login);

// ============================================
// PROTECTED ROUTES
// ============================================

/**
 * @route   GET /api/auth/verify
 * @desc    Verify JWT token validity
 * @access  Private
 */
router.get('/verify', authenticateToken, authController.verifyToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;