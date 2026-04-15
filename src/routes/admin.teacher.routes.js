// src/routes/admin.teacher.routes.js
// This is for SCHOOL_ADMIN to manage teachers

const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacher.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireAnyPermission } = require('../middleware/rbac.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

// All routes require SCHOOL_ADMIN
router.use(authenticateToken);
router.use(requireAnyPermission(['users:read', 'users:write', 'school:manage']));
router.use(requireAdmin);

/**
 * @route   POST /api/admin/teachers
 * @desc    Create teacher (School Admin)
 */
router.post('/', requireAnyPermission(['users:write']), auditAuthorizedAccess('admin_teachers.write.create'), teacherController.createTeacher);

/**
 * @route   GET /api/admin/teachers
 * @desc    Get all teachers (School Admin)
 */
router.get('/', requireAnyPermission(['users:read']), auditAuthorizedAccess('admin_teachers.read.list'), teacherController.getAllTeachers);

/**
 * @route   GET /api/admin/teachers/:teacherId
 * @desc    Get single teacher (School Admin)
 */
router.get('/:teacherId', requireAnyPermission(['users:read']), auditAuthorizedAccess('admin_teachers.read.single'), teacherController.getTeacherById);

/**
 * @route   PUT /api/admin/teachers/:teacherId
 * @desc    Update teacher (School Admin)
 */
router.put('/:teacherId', requireAnyPermission(['users:write']), auditAuthorizedAccess('admin_teachers.write.update'), teacherController.updateTeacher);

/**
 * @route   PATCH /api/admin/teachers/:teacherId/status
 * @desc    Update teacher status (School Admin)
 */
router.patch('/:teacherId/status', requireAnyPermission(['users:write']), auditAuthorizedAccess('admin_teachers.write.status'), teacherController.updateTeacherStatus);

/**
 * @route   DELETE /api/admin/teachers/:teacherId
 * @desc    Delete teacher (School Admin)
 */
router.delete('/:teacherId', requireAnyPermission(['users:write']), auditAuthorizedAccess('admin_teachers.write.delete'), teacherController.deleteTeacher);

module.exports = router;
