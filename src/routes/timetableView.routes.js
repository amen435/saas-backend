// src/routes/timetableView.routes.js

const express = require('express');
const router = express.Router();
const timetableViewController = require('../controllers/timetableView.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * CLASS TIMETABLE
 * Students, Parents, Teachers, Admins can view
 */
router.get(
  '/class/:classId',
  timetableViewController.getClassTimetable
);

/**
 * TEACHER TIMETABLE
 * Teachers can view their own, Admins can view any
 */
router.get(
  '/teacher/:teacherId',
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  timetableViewController.getTeacherTimetable
);

/**
 * STUDENT TIMETABLE
 * Students view their own class timetable
 */
router.get(
  '/student/my-timetable',
  requireRole(['STUDENT']),
  timetableViewController.getMyTimetable
);

/**
 * PARENT TIMETABLES
 * Parents view their children's timetables
 */
router.get(
  '/parent/child/:studentId',
  requireRole(['PARENT']),
  timetableViewController.getChildTimetable
);

router.get(
  '/parent/all-children',
  requireRole(['PARENT']),
  timetableViewController.getAllChildrenTimetables
);

/**
 * DAY TIMETABLE
 * Get timetable for a specific day
 */
router.get(
  '/day/:classId/:dayOfWeek',
  timetableViewController.getDayTimetable
);

module.exports = router;