// src/ai/routes/aiAnalytics.routes.js

const express = require('express');
const router = express.Router();
const aiAnalyticsController = require('../controllers/aiAnalytics.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/rbac.middleware');
const { checkOwnership, ensureStudentOwnsStudentParam, ensureParentOwnsStudentParam } = require('../../middleware/ownership.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * Student performance analysis
 */
router.get(
  '/student-performance/:studentId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  checkOwnership({ studentIdSources: ['params.studentId'] }),
  aiAnalyticsController.analyzeStudentPerformance
);

/**
 * Attendance trends
 */
router.get(
  '/attendance-trends/:studentId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN', 'PARENT']),
  checkOwnership({ studentIdSources: ['params.studentId'] }),
  ensureParentOwnsStudentParam,
  aiAnalyticsController.analyzeAttendanceTrends
);

/**
 * At-risk students
 */
router.get(
  '/at-risk-students/:classId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  checkOwnership({ classIdSources: ['params.classId'] }),
  aiAnalyticsController.identifyAtRiskStudents
);

/**
 * Class performance comparison
 */
router.get(
  '/class-performance/:classId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  checkOwnership({ classIdSources: ['params.classId'] }),
  aiAnalyticsController.compareClassPerformance
);

/**
 * Performance trends
 */
router.get(
  '/performance-trends/:studentId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN', 'STUDENT', 'PARENT']),
  checkOwnership({ studentIdSources: ['params.studentId'] }),
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
  aiAnalyticsController.getPerformanceTrends
);

/**
 * School overview
 */
router.get(
  '/school-overview',
  requireRole(['SCHOOL_ADMIN']),
  aiAnalyticsController.getSchoolOverview
);

router.get(
  '/platform-overview',
  requireRole(['SUPER_ADMIN']),
  aiAnalyticsController.getPlatformOverview
);

module.exports = router;
