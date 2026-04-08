// src/routes/teacher.normal.routes.js
// This is for TEACHERS to access their own data

const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacher.controller');
const teacherGradesController = require('../controllers/teacherGrades.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAnyPermission } = require('../middleware/rbac.middleware');
const { ensureTeacherAssignedClass } = require('../middleware/assignment.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

// All routes require TEACHER authentication
router.use(authenticateToken);
router.use(requireAnyPermission(['attendance:read', 'attendance:write', 'attendance:write:assigned', 'grades:read', 'grades:write', 'grades:write:assigned']));
router.use(requireRole(['TEACHER', 'HOMEROOM_TEACHER']));

/**
 * @route   GET /api/teacher/my-classes
 * @desc    Get classes the teacher is assigned to
 * @access  TEACHER
 */
router.get('/my-classes', requireAnyPermission(['attendance:read', 'grades:read']), auditAuthorizedAccess('teacher.read.my_classes'), teacherController.getMyClasses);

/**
 * @route   GET /api/teacher/classes/:classId/students
 * @desc    Get students in a class teacher teaches
 * @access  TEACHER
 */
router.get('/classes/:classId/students', requireAnyPermission(['attendance:read', 'grades:read']), ensureTeacherAssignedClass, auditAuthorizedAccess('teacher.read.class_students'), teacherController.getClassStudents);

/**
 * @route   POST /api/teacher/classes/:classId/grades
 * @desc    Add grades for students in a class
 * @access  TEACHER (active role)
 */
router.post(
  '/classes/:classId/grades',
  requireAnyPermission(['grades:write', 'grades:write:assigned']),
  requireRole(['TEACHER']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('teacher.write.class_grades'),
  teacherGradesController.addClassGrades
);

/**
 * @route   GET /api/teacher/classes/:classId/grades
 * @desc    Get all grades for a class
 * @access  TEACHER (active role)
 */
router.get(
  '/classes/:classId/grades',
  requireAnyPermission(['grades:read']),
  requireRole(['TEACHER']),
  ensureTeacherAssignedClass,
  auditAuthorizedAccess('teacher.read.class_grades'),
  teacherGradesController.getClassGrades
);

/**
 * @route   GET /api/teacher/profile
 * @desc    Get teacher's own profile
 * @access  TEACHER
 */
router.get('/profile', requireAnyPermission(['grades:read', 'attendance:read']), auditAuthorizedAccess('teacher.read.profile'), teacherController.getMyProfile);

/**
 * @route   GET /api/teacher/my-attendance
 * @desc    Get current teacher attendance history
 * @access  TEACHER
 */
router.get('/my-attendance', requireAnyPermission(['attendance:read']), requireRole(['TEACHER']), auditAuthorizedAccess('teacher.read.my_attendance'), teacherController.getMyAttendance);

module.exports = router;