// src/routes/teacher.routes.js

const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacher.controller');
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
 * @route   GET /api/teacher/profile
 * @desc    Get teacher's own profile
 * @access  TEACHER
 */
router.get('/profile', teacherController.getMyProfile);

// TODO: Add homework routes here
// router.post('/classes/:classId/homework', teacherController.createHomework);

// TODO: Add grading routes here
// router.post('/classes/:classId/grades', teacherController.giveGrades);

module.exports = router;