const express = require('express');
const router = express.Router();
const parentController = require('../controllers/parent.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

// Authenticated parent self-service
router.use(authenticateToken);

/**
 * @route   GET /api/parents/me/children
 * @desc    Get all students linked to the logged-in parent
 * @access  PARENT
 */
router.get(
  '/me/children',
  requireRole(['PARENT']),
  parentController.getMyChildren
);

module.exports = router;

