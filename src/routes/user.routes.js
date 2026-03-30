// src/routes/user.routes.js

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireSuperAdmin } = require('../middleware/rbac.middleware');

/**
 * @route   GET /api/users/me
 * @desc    Get current user's available roles
 * @access  Any authenticated user
 */
router.get('/me', authenticateToken, userController.getCurrentUserRoles);

// All routes below require SUPER_ADMIN authentication
router.use(authenticateToken);
router.use(requireSuperAdmin);

/**
 * @route   POST /api/users/school-admins
 * @desc    Create a new school admin
 * @access  SUPER_ADMIN only
 */
router.post('/school-admins', userController.createSchoolAdmin);

/**
 * @route   GET /api/users/school-admins
 * @desc    Get all school admins
 * @query   ?schoolId=1&isActive=true
 * @access  SUPER_ADMIN only
 */
router.get('/school-admins', userController.getAllSchoolAdmins);

/**
 * @route   GET /api/users/school-admins/:userId
 * @desc    Get single school admin by userId
 * @access  SUPER_ADMIN only
 */
router.get('/school-admins/:userId', userController.getSchoolAdminById);

/**
 * @route   PATCH /api/users/school-admins/:userId/activate
 * @desc    Activate school admin
 * @access  SUPER_ADMIN only
 */
router.patch('/school-admins/:userId/activate', userController.activateSchoolAdmin);

/**
 * @route   PATCH /api/users/school-admins/:userId/deactivate
 * @desc    Deactivate school admin
 * @access  SUPER_ADMIN only
 */
router.patch('/school-admins/:userId/deactivate', userController.deactivateSchoolAdmin);

module.exports = router;