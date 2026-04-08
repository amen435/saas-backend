// src/routes/parent.routes.js

const express = require('express');
const router = express.Router();
const parentController = require('../controllers/parent.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const { verifyHomeroomTeacher } = require('../middleware/homeroom.middleware');

// All routes require TEACHER authentication
router.use(authenticateToken);
router.use(requireRole(['TEACHER', 'HOMEROOM_TEACHER']));

/**
 * @route   POST /api/homeroom/classes/:classId/parents
 * @desc    Create parent for student(s) in homeroom class
 * @access  HOMEROOM_TEACHER
 */
router.post(
  '/classes/:classId/parents',
  verifyHomeroomTeacher,
  parentController.createParent
);

/**
 * @route   GET /api/homeroom/classes/:classId/parents
 * @desc    Get all parents of students in homeroom class
 * @access  HOMEROOM_TEACHER
 */
router.get(
  '/classes/:classId/parents',
  verifyHomeroomTeacher,
  parentController.getClassParents
);

/**
 * @route   GET /api/homeroom/parents/:parentId
 * @desc    Get single parent details
 * @access  HOMEROOM_TEACHER
 */
router.get(
  '/parents/:parentId',
  parentController.getParentById
);

/**
 * @route   PUT /api/homeroom/parents/:parentId
 * @desc    Update parent basic info
 * @access  HOMEROOM_TEACHER
 */
router.put(
  '/parents/:parentId',
  parentController.updateParent
);

/**
 * @route   POST /api/homeroom/parents/:parentId/add-child
 * @desc    Link another student to parent
 * @access  HOMEROOM_TEACHER
 */
router.post(
  '/classes/:classId/parents/:parentId/add-child',
  verifyHomeroomTeacher,
  parentController.addChildToParent
);

/**
 * @route   DELETE /api/homeroom/parents/:parentId/children/:studentId
 * @desc    Remove student from parent
 * @access  HOMEROOM_TEACHER
 */
router.delete(
  '/parents/:parentId/children/:studentId',
  parentController.removeChildFromParent
);

module.exports = router;