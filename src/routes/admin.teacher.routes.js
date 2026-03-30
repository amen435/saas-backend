// src/routes/admin.teacher.routes.js
// This is for SCHOOL_ADMIN to manage teachers

const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacher.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');

// All routes require SCHOOL_ADMIN
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * @route   POST /api/admin/teachers
 * @desc    Create teacher (School Admin)
 */
router.post('/', teacherController.createTeacher);

/**
 * @route   GET /api/admin/teachers
 * @desc    Get all teachers (School Admin)
 */
router.get('/', teacherController.getAllTeachers);

/**
 * @route   GET /api/admin/teachers/:teacherId
 * @desc    Get single teacher (School Admin)
 */
router.get('/:teacherId', teacherController.getTeacherById);

/**
 * @route   PUT /api/admin/teachers/:teacherId
 * @desc    Update teacher (School Admin)
 */
router.put('/:teacherId', teacherController.updateTeacher);

/**
 * @route   PATCH /api/admin/teachers/:teacherId/deactivate
 * @desc    Deactivate teacher (School Admin)
 */
router.patch('/:teacherId/deactivate', teacherController.deactivateTeacher);

module.exports = router;