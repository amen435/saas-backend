// src/routes/class.routes.js

const express = require('express');
const router = express.Router();
const classController = require('../controllers/class.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');

// All routes require SCHOOL_ADMIN
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * @route   POST /api/classes
 * @desc    Create class
 * @access  SCHOOL_ADMIN
 */
router.post('/', classController.createClass);

/**
 * @route   GET /api/classes
 * @desc    Get all classes
 * @access  SCHOOL_ADMIN
 */
router.get('/', classController.getAllClasses);

/**
 * @route   GET /api/classes/:classId
 * @desc    Get single class
 * @access  SCHOOL_ADMIN
 */
router.get('/:classId', classController.getClassById);

/**
 * @route   PUT /api/classes/:classId
 * @desc    Update class
 * @access  SCHOOL_ADMIN
 */
router.put('/:classId', classController.updateClass);

/**
 * @route   POST /api/classes/:classId/assign-teacher
 * @desc    Assign teacher to class
 * @access  SCHOOL_ADMIN
 */
router.post('/:classId/assign-teacher', classController.assignTeacherToClass);

/**
 * @route   DELETE /api/classes/:classId/teachers/:teacherId
 * @desc    Remove teacher from class
 * @access  SCHOOL_ADMIN
 */
router.delete('/:classId/teachers/:teacherId', classController.removeTeacherFromClass);

module.exports = router;