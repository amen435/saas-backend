const express = require('express');
const router = express.Router();
const parentController = require('../controllers/parent.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAnyPermission } = require('../middleware/rbac.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

// Authenticated parent self-service
router.use(authenticateToken);

/**
 * @route   GET /api/parents/me/children
 * @desc    Get all students linked to the logged-in parent
 * @access  PARENT
 */
router.get(
  '/me/children',
  requireAnyPermission(['attendance:read:child', 'grades:read:child']),
  requireRole(['PARENT']),
  auditAuthorizedAccess('parents.read.my_children'),
  parentController.getMyChildren
);

module.exports = router;

