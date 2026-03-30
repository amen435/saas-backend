// src/routes/teacher.normal.routes.js
// This is for TEACHERS to access their own data

const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacher.controller');
const teacherGradesController = require('../controllers/teacherGrades.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

// All routes require TEACHER authentication
router.use(authenticateToken);
router.use(requireRole(['TEACHER', 'HOMEROOM_TEACHER']));

/**
 * @route   GET /api/teacher/my-classes
 * @desc    Get classes the teacher is assigned to
 * @access  TEACHER
 */
router.get('/my-classes', teacherController.getMyClasses);

/**
 * @route   GET /api/teacher/classes/:classId/students
 * @desc    Get students in a class teacher teaches
 * @access  TEACHER
 */
router.get('/classes/:classId/students', teacherController.getClassStudents);

/**
 * @route   POST /api/teacher/classes/:classId/grades
 * @desc    Add grades for students in a class
 * @access  TEACHER (active role)
 */
router.post(
  '/classes/:classId/grades',
  requireRole(['TEACHER']),
  teacherGradesController.addClassGrades
);

/**
 * @route   GET /api/teacher/classes/:classId/grades
 * @desc    Get all grades for a class
 * @access  TEACHER (active role)
 */
router.get(
  '/classes/:classId/grades',
  requireRole(['TEACHER']),
  teacherGradesController.getClassGrades
);

/**
 * @route   GET /api/teacher/profile
 * @desc    Get teacher's own profile
 * @access  TEACHER
 */
router.get('/profile', teacherController.getMyProfile);

/**
 * @route   GET /api/teacher/my-attendance
 * @desc    Get current teacher attendance history
 * @access  TEACHER
 */
router.get('/my-attendance', requireRole(['TEACHER']), teacherController.getMyAttendance);

module.exports = router;