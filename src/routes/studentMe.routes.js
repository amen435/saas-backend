const express = require('express');
const { authenticateToken } = require('../middleware/auth.middleware');
const { authorizeRoles, requireAnyPermission, requireRole } = require('../middleware/rbac.middleware');
const studentController = require('../controllers/adminStudent.controller');
const studentMeController = require('../controllers/studentMe.controller');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');
const { validateBody, validateParams } = require('../middleware/validate.middleware');
const {
  createStudentSchema,
  updateStudentSchema,
  idParamSchema,
} = require('../validation/student.validation');

const router = express.Router();

router.use(authenticateToken);

router.get(
  '/',
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HOMEROOM_TEACHER'),
  auditAuthorizedAccess('students.read.list'),
  studentController.listStudents
);

router.get(
  '/me',
  requireAnyPermission(['grades:read:self']),
  requireRole(['STUDENT']),
  auditAuthorizedAccess('students.read.self_profile'),
  studentMeController.getMyStudentProfile
);

router.get(
  '/:id',
  validateParams(idParamSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HOMEROOM_TEACHER', 'TEACHER', 'PARENT'),
  auditAuthorizedAccess('students.read.single'),
  studentController.getStudentById
);

router.post(
  '/',
  validateBody(createStudentSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('students.write.create'),
  studentController.createStudent
);

router.put(
  '/:id',
  validateParams(idParamSchema),
  validateBody(updateStudentSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('students.write.update'),
  studentController.updateStudent
);

router.patch(
  '/:id/deactivate',
  validateParams(idParamSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('students.write.deactivate'),
  studentController.deactivateStudent
);

router.patch(
  '/:id/activate',
  validateParams(idParamSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('students.write.activate'),
  studentController.activateStudent
);

router.patch(
  '/:id/status',
  validateParams(idParamSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('students.write.status'),
  studentController.updateStudentStatus
);

router.delete(
  '/:id',
  validateParams(idParamSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('students.write.delete'),
  studentController.deleteStudent
);

module.exports = router;
