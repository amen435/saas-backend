// src/routes/student.routes.js

const express = require('express');
const router = express.Router();
const studentController = require('../controllers/student.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

// All routes require authentication
router.use(authenticateToken);

// All routes require TEACHER role (homeroom teachers are teachers)
router.use(requireRole(['TEACHER', 'HOMEROOM_TEACHER']));

/**
 * @route   POST /api/students
 * @desc    Create student (Homeroom teacher only)
 * @access  HOMEROOM_TEACHER
 */
router.post('/', studentController.createStudent);

/**
 * @route   GET /api/students
 * @desc    Get students from homeroom teacher's class(es)
 * @query   ?classId=1&isActive=true
 * @access  HOMEROOM_TEACHER
 */
router.get('/', studentController.getMyClassStudents);

/**
 * @route   GET /api/students/:studentId
 * @desc    Get single student
 * @access  HOMEROOM_TEACHER (of student's class)
 */
router.get('/:studentId', studentController.getStudentById);

/**
 * @route   PUT /api/students/:studentId
 * @desc    Update student
 * @access  HOMEROOM_TEACHER (of student's class)
 */
router.put('/:studentId', studentController.updateStudent);

/**
 * @route   PATCH /api/students/:studentId/deactivate
 * @desc    Deactivate student
 * @access  HOMEROOM_TEACHER (of student's class)
 */
router.patch('/:studentId/deactivate', studentController.deactivateStudent);

module.exports = router;