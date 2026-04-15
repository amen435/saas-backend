const express = require('express');
const studentController = require('../controllers/adminStudent.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { authorizeRoles, requireAdmin, requireAnyPermission } = require('../middleware/rbac.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

const router = express.Router();

router.use(authenticateToken);

router.get(
  '/',
  authorizeRoles('SCHOOL_ADMIN', 'SUPER_ADMIN'),
  requireAnyPermission(['users:read']),
  auditAuthorizedAccess('admin_students.read.list'),
  studentController.listStudents
);

router.get(
  '/:id',
  authorizeRoles('SCHOOL_ADMIN', 'SUPER_ADMIN'),
  requireAnyPermission(['users:read']),
  auditAuthorizedAccess('admin_students.read.single'),
  studentController.getStudentById
);

router.post(
  '/',
  requireAdmin,
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('admin_students.write.create'),
  studentController.createStudent
);

router.put(
  '/:id',
  requireAdmin,
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('admin_students.write.update'),
  studentController.updateStudent
);

router.patch(
  '/:id/status',
  requireAdmin,
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('admin_students.write.status'),
  studentController.updateStudentStatus
);

router.delete(
  '/:id',
  requireAdmin,
  requireAnyPermission(['users:write']),
  auditAuthorizedAccess('admin_students.write.delete'),
  studentController.deleteStudent
);

module.exports = router;
