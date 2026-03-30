// src/ai/routes/aiHomework.routes.js

const express = require('express');
const router = express.Router();
const aiHomeworkController = require('../controllers/aiHomework.controller');
const { aiHomeworkLimiter } = require('../middleware/aiRateLimit');
const { authenticateToken } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * Teacher-only endpoints
 */
router.post(
  '/generate',
  aiHomeworkLimiter,
  requireRole(['TEACHER', 'HOMEROOM_TEACHER']),
  aiHomeworkController.generateHomework
);

router.get(
  '/',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER']),
  aiHomeworkController.getTeacherHomework
);

router.get(
  '/stats',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER']),
  aiHomeworkController.getHomeworkStats
);

/**
 * Class homework — must be registered before /:id so "class" is not treated as an id.
 */
router.get(
  '/class/:classId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT']),
  aiHomeworkController.getClassHomework
);

router.post(
  '/submissions',
  requireRole(['STUDENT']),
  aiHomeworkController.saveStudentSubmission
);

router.get(
  '/:id/submissions',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER']),
  aiHomeworkController.listHomeworkSubmissions
);

router.get(
  '/:id',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER']),
  aiHomeworkController.getHomeworkById
);

router.put(
  '/:id',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER']),
  aiHomeworkController.updateHomework
);

router.patch(
  '/:id/publish',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER']),
  aiHomeworkController.publishHomework
);

router.delete(
  '/:id',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER']),
  aiHomeworkController.deleteHomework
);

router.post(
  '/:id/regenerate',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER']),
  aiHomeworkController.regenerateQuestions
);

module.exports = router;
