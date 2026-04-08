// src/routes/attendance.routes.js

const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAnyPermission } = require('../middleware/rbac.middleware');
const {
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
} = require('../middleware/ownership.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');
const { ensureTeacherAssignedClass } = require('../middleware/assignment.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * Record Attendance
 */
router.post(
  '/',
  requireAnyPermission(['attendance:write', 'attendance:write:assigned', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('attendance.write.single'),
  attendanceController.recordAttendance
);

router.post(
  '/bulk',
  requireAnyPermission(['attendance:write', 'attendance:write:assigned', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('attendance.write.bulk'),
  attendanceController.recordBulkAttendance
);

/**
 * Get Attendance
 */
router.get(
  '/class/:classId',
  requireAnyPermission(['attendance:read', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('attendance.read.class'),
  attendanceController.getClassAttendance
);

router.get(
  '/student/:studentId',
  requireAnyPermission([
    'attendance:read',
    'attendance:read:self',
    'attendance:read:child',
    'school:manage',
  ]),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT', 'SCHOOL_ADMIN']),
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
  auditAuthorizedAccess('attendance.read.student'),
  attendanceController.getStudentAttendance
);

/**
 * Reports
 */
router.get(
  '/report/class/:classId',
  requireAnyPermission(['attendance:read', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('attendance.read.report'),
  attendanceController.getClassAttendanceReport
);

/**
 * Delete
 */
router.delete(
  '/:attendanceId',
  requireAnyPermission(['attendance:write', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  auditAuthorizedAccess('attendance.delete'),
  attendanceController.deleteAttendance
);

module.exports = router;

