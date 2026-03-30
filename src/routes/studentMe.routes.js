const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const studentMeController = require('../controllers/studentMe.controller');

router.use(authenticateToken);

/**
 * GET /api/students/me
 * Student dashboard profile
 */
router.get('/me', requireRole(['STUDENT']), studentMeController.getMyStudentProfile);

module.exports = router;

