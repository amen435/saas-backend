const express = require('express');
const deviceController = require('../controllers/device.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { authorizeRoles, requireAnyPermission } = require('../middleware/rbac.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');
const { validateBody } = require('../middleware/validate.middleware');
const { createDeviceSchema } = require('../validation/device.validation');

const router = express.Router();

router.use(authenticateToken);

router.get(
  '/',
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:read', 'school:manage']),
  auditAuthorizedAccess('devices.read.list'),
  deviceController.listDevices
);

router.post(
  '/',
  validateBody(createDeviceSchema),
  authorizeRoles('SUPER_ADMIN', 'SCHOOL_ADMIN'),
  requireAnyPermission(['users:write', 'school:manage']),
  auditAuthorizedAccess('devices.write.create'),
  deviceController.createDevice
);

module.exports = router;
