const express = require('express');
const teacherController = require('../controllers/teacher.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { authorizeRoles, requireAnyPermission } = require('../middleware/rbac.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');
const { validateBody, validateParams } = require('../middleware/validate.middleware');
const {
  createTeacherSchema,
  updateTeacherSchema,
  idParamSchema,
} = require('../validation/teacher.validation');

const router = express.Router();

router.use(authenticateToken);

router.get(
  '/',
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:read']),
  auditAuthorizedAccess('teachers.read.list'),
  teacherController.getAllTeachers
);

router.get(
  '/:id',
  validateParams(idParamSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:read']),
  auditAuthorizedAccess('teachers.read.single'),
  teacherController.getTeacherById
);

router.post(
  '/',
  validateBody(createTeacherSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('teachers.write.create'),
  teacherController.createTeacher
);

router.put(
  '/:id',
  validateParams(idParamSchema),
  validateBody(updateTeacherSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('teachers.write.update'),
  teacherController.updateTeacher
);

router.patch(
  '/:id/deactivate',
  validateParams(idParamSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('teachers.write.deactivate'),
  teacherController.deactivateTeacher
);

router.patch(
  '/:id/activate',
  validateParams(idParamSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('teachers.write.activate'),
  teacherController.activateTeacher
);

router.patch(
  '/:id/status',
  validateParams(idParamSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('teachers.write.status'),
  teacherController.updateTeacherStatus
);

router.delete(
  '/:id',
  validateParams(idParamSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('teachers.write.delete'),
  teacherController.deleteTeacher
);

module.exports = router;
