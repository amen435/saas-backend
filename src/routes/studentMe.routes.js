const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAnyPermission } = require('../middleware/rbac.middleware');
const studentMeController = require('../controllers/studentMe.controller');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

router.use(authenticateToken);

/**
 * GET /api/students/me
 * Student dashboard profile
 */
router.get('/me', requireAnyPermission(['grades:read:self']), requireRole(['STUDENT']), auditAuthorizedAccess('students.read.self_profile'), studentMeController.getMyStudentProfile);

module.exports = router;

