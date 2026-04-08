// src/routes/timetableView.routes.js

const express = require('express');
const router = express.Router();
const timetableViewController = require('../controllers/timetableView.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAnyPermission } = require('../middleware/rbac.middleware');
const { ensureTeacherOwnsTeacherParam, ensureParentOwnsStudentParam } = require('../middleware/ownership.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');
const { ensureTeacherAssignedClass } = require('../middleware/assignment.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * CLASS TIMETABLE
 * Students, Parents, Teachers, Admins can view
 */
router.get(
  '/class/:classId',
  requireAnyPermission(['attendance:read', 'attendance:read:self', 'attendance:read:child', 'school:manage']),
  requireRole(['SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('timetable_view.read.class'),
  timetableViewController.getClassTimetable
);

/**
 * TEACHER TIMETABLE
 * Teachers can view their own, Admins can view any
 */
router.get(
  '/teacher/:teacherId',
  requireAnyPermission(['attendance:read', 'school:manage']),
  requireRole(['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN']),
  ensureTeacherOwnsTeacherParam,
  auditAuthorizedAccess('timetable_view.read.teacher'),
  timetableViewController.getTeacherTimetable
);

/**
 * STUDENT TIMETABLE
 * Students view their own class timetable
 */
router.get(
  '/student/my-timetable',
  requireAnyPermission(['attendance:read:self']),
  requireRole(['STUDENT']),
  auditAuthorizedAccess('timetable_view.read.student_self'),
  timetableViewController.getMyTimetable
);

/**
 * PARENT TIMETABLES
 * Parents view their children's timetables
 */
router.get(
  '/parent/child/:studentId',
  requireAnyPermission(['attendance:read:child']),
  requireRole(['PARENT']),
  ensureParentOwnsStudentParam,
  auditAuthorizedAccess('timetable_view.read.parent_child'),
  timetableViewController.getChildTimetable
);

router.get(
  '/parent/all-children',
  requireAnyPermission(['attendance:read:child']),
  requireRole(['PARENT']),
  auditAuthorizedAccess('timetable_view.read.parent_children'),
  timetableViewController.getAllChildrenTimetables
);

/**
 * DAY TIMETABLE
 * Get timetable for a specific day
 */
router.get(
  '/day/:classId/:dayOfWeek',
  requireAnyPermission(['attendance:read', 'attendance:read:self', 'attendance:read:child', 'school:manage']),
  requireRole(['SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('timetable_view.read.day'),
  timetableViewController.getDayTimetable
);

module.exports = router;