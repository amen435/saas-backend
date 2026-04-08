// src/routes/class.routes.js

const express = require('express');
const router = express.Router();
const classController = require('../controllers/class.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireAnyPermission } = require('../middleware/rbac.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

// All routes require SCHOOL_ADMIN
router.use(authenticateToken);
router.use(requireAnyPermission(['school:manage']));
router.use(requireAdmin);

/**
 * @route   POST /api/classes
 * @desc    Create class
 * @access  SCHOOL_ADMIN
 */
router.post('/', auditAuthorizedAccess('classes.write.create'), classController.createClass);

/**
 * @route   GET /api/classes
 * @desc    Get all classes
 * @access  SCHOOL_ADMIN
 */
router.get('/', auditAuthorizedAccess('classes.read.list'), classController.getAllClasses);

/**
 * @route   GET /api/classes/:classId
 * @desc    Get single class
 * @access  SCHOOL_ADMIN
 */
router.get('/:classId', auditAuthorizedAccess('classes.read.single'), classController.getClassById);

/**
 * @route   PUT /api/classes/:classId
 * @desc    Update class
 * @access  SCHOOL_ADMIN
 */
router.put('/:classId', auditAuthorizedAccess('classes.write.update'), classController.updateClass);

/**
 * @route   POST /api/classes/:classId/assign-teacher
 * @desc    Assign teacher to class
 * @access  SCHOOL_ADMIN
 */
router.post('/:classId/assign-teacher', auditAuthorizedAccess('classes.write.assign_teacher'), classController.assignTeacherToClass);

/**
 * @route   DELETE /api/classes/:classId/teachers/:teacherId
 * @desc    Remove teacher from class
 * @access  SCHOOL_ADMIN
 */
router.delete('/:classId/teachers/:teacherId', auditAuthorizedAccess('classes.write.remove_teacher'), classController.removeTeacherFromClass);

module.exports = router;