// src/routes/timetable.routes.js

const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetable.controller');
const timetableViewController = require('../controllers/timetableView.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAnyPermission } = require('../middleware/rbac.middleware');
const { ensureStudentOwnsStudentParam, ensureTeacherOwnsTeacherParam } = require('../middleware/ownership.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');
const { ensureTeacherAssignedClass } = require('../middleware/assignment.middleware');

router.use(authenticateToken);

// Get period configurations
router.get(
  '/periods',
  requireAnyPermission(['attendance:read', 'attendance:read:self', 'attendance:read:child', 'school:manage']),
  requireRole(['SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT']),
  auditAuthorizedAccess('timetable.read.periods'),
  timetableController.getPeriodConfigurations
);

// View timetables
router.get(
  '/class/:classId',
  requireAnyPermission(['attendance:read', 'attendance:read:self', 'attendance:read:child', 'school:manage']),
  requireRole(['SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('timetable.read.class'),
  timetableController.getTimetableByClass
);
router.get(
  '/teacher/:teacherId',
  requireAnyPermission(['attendance:read', 'school:manage']),
  requireRole(['SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  ensureTeacherOwnsTeacherParam,
  auditAuthorizedAccess('timetable.read.teacher'),
  timetableController.getTimetableByTeacher
);

// STUDENT: timetable preview for a specific student (used by StudentDashboard)
router.get(
  '/student/:studentId',
  requireAnyPermission(['attendance:read:self']),
  requireRole(['STUDENT']),
  ensureStudentOwnsStudentParam,
  auditAuthorizedAccess('timetable.read.student_self'),
  timetableViewController.getStudentTimetableById
);

// Manage timetables (SCHOOL_ADMIN only)
router.post('/', requireAnyPermission(['school:manage']), requireRole(['SCHOOL_ADMIN']), auditAuthorizedAccess('timetable.write.create'), timetableController.createTimetable);
router.put('/:id', requireAnyPermission(['school:manage']), requireRole(['SCHOOL_ADMIN']), auditAuthorizedAccess('timetable.write.update'), timetableController.updateTimetable);
router.delete('/:id', requireAnyPermission(['school:manage']), requireRole(['SCHOOL_ADMIN']), auditAuthorizedAccess('timetable.write.delete'), timetableController.deleteTimetable);

module.exports = router;