// src/routes/grade.routes.js

const express = require('express');
const router = express.Router();
const gradeController = require('../controllers/grade.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * IMPORTANT: Specific routes MUST come BEFORE dynamic parameter routes
 * Order matters in Express!
 */

// ============================================
// GRADE COMPONENTS - SPECIFIC ROUTES FIRST
// ============================================

// Get all components
router.get(
  '/components',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.getGradeComponents
);

// Create component
router.post(
  '/components',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.createGradeComponent
);

// SPECIFIC ROUTES FIRST (these must come before /:id)
router.delete(
  '/components/:id/with-marks',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.deleteComponentWithMarks
);

router.delete(
  '/components/:id/marks',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.deleteComponentMarks
);

router.patch(
  '/components/:id/deactivate',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.softDeleteGradeComponent
);

// GENERIC ROUTES LAST
router.put(
  '/components/:id',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.updateGradeComponent
);

router.delete(
  '/components/:id',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.deleteGradeComponent
);

// ============================================
// STUDENT MARKS
// ============================================

// Create/Update mark
router.post(
  '/marks',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.enterStudentMark
);

// Delete individual mark
router.delete(
  '/marks/:markId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.deleteStudentMark
);

// Get student grade
router.get(
  '/student/:studentId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT', 'SCHOOL_ADMIN']),
  gradeController.getStudentGrade
);

// ============================================
// REPORTS & RANKINGS
// ============================================

// Get class grade report
router.get(
  '/class-report',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.getClassGradeReport
);

// Get class rankings
router.get(
  '/rankings',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.getClassRankings
);

// Get overall class rankings
router.get(
  '/overall-rankings',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  gradeController.getOverallClassRankings
);

router.get(
  '/school-rankings',
  requireRole(['SCHOOL_ADMIN']),
  gradeController.getOverallSchoolRankings
);

// Get student rank
router.get(
  '/student-rank/:studentId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT', 'SCHOOL_ADMIN']),
  gradeController.getStudentRankInfo
);

// Get aggregated student subject summary (for student/parent dashboards)
router.get(
  '/student-summary/:studentId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT', 'SCHOOL_ADMIN']),
  gradeController.getStudentSummary
);

module.exports = router;
