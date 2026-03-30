// src/routes/attendance.routes.js

const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * Record Attendance
 */
router.post(
  '/',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  attendanceController.recordAttendance
);

router.post(
  '/bulk',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  attendanceController.recordBulkAttendance
);

/**
 * Get Attendance
 */
router.get(
  '/class/:classId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  attendanceController.getClassAttendance
);

router.get(
  '/student/:studentId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT', 'SCHOOL_ADMIN']),
  attendanceController.getStudentAttendance
);

/**
 * Reports
 */
router.get(
  '/report/class/:classId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  attendanceController.getClassAttendanceReport
);

/**
 * Delete
 */
router.delete(
  '/:attendanceId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  attendanceController.deleteAttendance
);

module.exports = router;

