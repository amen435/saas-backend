// src/routes/teacherAttendance.routes.js

const express = require('express');
const router = express.Router();
const teacherAttendanceController = require('../controllers/teacherAttendance.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAnyPermission } = require('../middleware/rbac.middleware');
const { ensureTeacherOwnsTeacherParam } = require('../middleware/ownership.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * Record Attendance
 */
router.post(
  '/',
  requireAnyPermission(['school:manage']),
  requireRole(['SCHOOL_ADMIN']),
  auditAuthorizedAccess('teacher_attendance.write.single'),
  teacherAttendanceController.recordTeacherAttendance
);

router.post(
  '/bulk',
  requireAnyPermission(['school:manage']),
  requireRole(['SCHOOL_ADMIN']),
  auditAuthorizedAccess('teacher_attendance.write.bulk'),
  teacherAttendanceController.recordBulkTeacherAttendance
);

/**
 * Get Attendance
 */
router.get(
  '/school',
  requireAnyPermission(['school:manage']),
  requireRole(['SCHOOL_ADMIN']),
  auditAuthorizedAccess('teacher_attendance.read.school'),
  teacherAttendanceController.getSchoolTeacherAttendance
);

router.get(
  '/teacher/:teacherId',
  requireAnyPermission(['attendance:read', 'school:manage']),
  requireRole(['SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  ensureTeacherOwnsTeacherParam,
  auditAuthorizedAccess('teacher_attendance.read.teacher'),
  teacherAttendanceController.getTeacherAttendanceHistory
);

/**
 * Reports
 */
router.get(
  '/report',
  requireAnyPermission(['school:manage']),
  requireRole(['SCHOOL_ADMIN']),
  auditAuthorizedAccess('teacher_attendance.read.report'),
  teacherAttendanceController.getSchoolAttendanceReport
);

/**
 * Update & Delete
 */
router.put(
  '/:attendanceId',
  requireAnyPermission(['school:manage']),
  requireRole(['SCHOOL_ADMIN']),
  auditAuthorizedAccess('teacher_attendance.write.update'),
  teacherAttendanceController.updateTeacherAttendance
);

router.delete(
  '/:attendanceId',
  requireAnyPermission(['school:manage']),
  requireRole(['SCHOOL_ADMIN']),
  auditAuthorizedAccess('teacher_attendance.write.delete'),
  teacherAttendanceController.deleteTeacherAttendance
);

module.exports = router;