// src/routes/grade.routes.js

const express = require('express');
const router = express.Router();
const gradeController = require('../controllers/grade.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAnyPermission } = require('../middleware/rbac.middleware');
const {
  checkOwnership,
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
} = require('../middleware/ownership.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');
const { ensureTeacherAssignedClass } = require('../middleware/assignment.middleware');

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
  requireAnyPermission(['grades:read', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('grades.read.components'),
  gradeController.getGradeComponents
);

// Create component
router.post(
  '/components',
  requireAnyPermission(['grades:write', 'grades:write:assigned', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('grades.write.component.create'),
  gradeController.createGradeComponent
);

// SPECIFIC ROUTES FIRST (these must come before /:id)
router.delete(
  '/components/:id/with-marks',
  requireAnyPermission(['grades:write', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  auditAuthorizedAccess('grades.write.component.delete_with_marks'),
  gradeController.deleteComponentWithMarks
);

router.delete(
  '/components/:id/marks',
  requireAnyPermission(['grades:write', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  auditAuthorizedAccess('grades.write.component.delete_marks'),
  gradeController.deleteComponentMarks
);

router.patch(
  '/components/:id/deactivate',
  requireAnyPermission(['grades:write', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  auditAuthorizedAccess('grades.write.component.deactivate'),
  gradeController.softDeleteGradeComponent
);

// GENERIC ROUTES LAST
router.put(
  '/components/:id',
  requireAnyPermission(['grades:write', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  auditAuthorizedAccess('grades.write.component.update'),
  gradeController.updateGradeComponent
);

router.delete(
  '/components/:id',
  requireAnyPermission(['grades:write', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  auditAuthorizedAccess('grades.write.component.delete'),
  gradeController.deleteGradeComponent
);

// ============================================
// STUDENT MARKS
// ============================================

// Create/Update mark
router.post(
  '/marks',
  requireAnyPermission(['grades:write', 'grades:write:assigned', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('grades.write.mark'),
  gradeController.enterStudentMark
);

// Delete individual mark
router.delete(
  '/marks/:markId',
  requireAnyPermission(['grades:write', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  auditAuthorizedAccess('grades.write.mark.delete'),
  gradeController.deleteStudentMark
);

// Get student grade
router.get(
  '/student/:studentId',
  requireAnyPermission(['grades:read', 'grades:read:self', 'grades:read:child', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT', 'SCHOOL_ADMIN']),
  checkOwnership({ studentIdSources: ['params.studentId'] }),
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
  auditAuthorizedAccess('grades.read.student'),
  gradeController.getStudentGrade
);

// ============================================
// REPORTS & RANKINGS
// ============================================

// Get class grade report
router.get(
  '/class-report',
  requireAnyPermission(['grades:read', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('grades.read.class_report'),
  gradeController.getClassGradeReport
);

// Get class rankings
router.get(
  '/rankings',
  requireAnyPermission(['grades:read', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('grades.read.rankings'),
  gradeController.getClassRankings
);

// Get overall class rankings
router.get(
  '/overall-rankings',
  requireAnyPermission(['grades:read', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('grades.read.overall_rankings'),
  gradeController.getOverallClassRankings
);

router.get(
  '/school-rankings',
  requireAnyPermission(['school:manage']),
  requireRole(['SCHOOL_ADMIN']),
  auditAuthorizedAccess('grades.read.school_rankings'),
  gradeController.getOverallSchoolRankings
);

// Get student rank
router.get(
  '/student-rank/:studentId',
  requireAnyPermission(['grades:read', 'grades:read:self', 'grades:read:child', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT', 'SCHOOL_ADMIN']),
  checkOwnership({ studentIdSources: ['params.studentId'] }),
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
  auditAuthorizedAccess('grades.read.student_rank'),
  gradeController.getStudentRankInfo
);

// Get aggregated student subject summary (for student/parent dashboards)
router.get(
  '/student-summary/:studentId',
  requireAnyPermission(['grades:read', 'grades:read:self', 'grades:read:child', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT', 'SCHOOL_ADMIN']),
  checkOwnership({ studentIdSources: ['params.studentId'] }),
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
  auditAuthorizedAccess('grades.read.student_summary'),
  gradeController.getStudentSummary
);

module.exports = router;
