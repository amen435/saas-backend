// src/routes/teacherAttendance.routes.js

const express = require('express');
const router = express.Router();
const teacherAttendanceController = require('../controllers/teacherAttendance.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * Record Attendance
 */
router.post(
  '/',
  requireRole(['SCHOOL_ADMIN']),
  teacherAttendanceController.recordTeacherAttendance
);

router.post(
  '/bulk',
  requireRole(['SCHOOL_ADMIN']),
  teacherAttendanceController.recordBulkTeacherAttendance
);

/**
 * Get Attendance
 */
router.get(
  '/school',
  requireRole(['SCHOOL_ADMIN']),
  teacherAttendanceController.getSchoolTeacherAttendance
);

router.get(
  '/teacher/:teacherId',
  requireRole(['SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  teacherAttendanceController.getTeacherAttendanceHistory
);

/**
 * Reports
 */
router.get(
  '/report',
  requireRole(['SCHOOL_ADMIN']),
  teacherAttendanceController.getSchoolAttendanceReport
);

/**
 * Update & Delete
 */
router.put(
  '/:attendanceId',
  requireRole(['SCHOOL_ADMIN']),
  teacherAttendanceController.updateTeacherAttendance
);

router.delete(
  '/:attendanceId',
  requireRole(['SCHOOL_ADMIN']),
  teacherAttendanceController.deleteTeacherAttendance
);

module.exports = router;