const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/school.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireSuperAdmin, requirePermission, requireAnyPermission, requireSchool } = require('../middleware/rbac.middleware');
const { createImageUpload } = require('../middleware/upload.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

const schoolLogoUpload = createImageUpload('school-logos', 'school-logo');

router.use(authenticateToken);

router.post('/check-expiry', requirePermission('system:admin'), requireSuperAdmin, auditAuthorizedAccess('school.system.check_expiry'), schoolController.checkExpiredSchools);
router.post('/', requireAnyPermission(['school:manage', 'system:admin']), requireSuperAdmin, auditAuthorizedAccess('school.manage.create'), schoolController.createSchool);
router.get('/', requirePermission('school:manage'), requireSuperAdmin, auditAuthorizedAccess('school.manage.list'), schoolController.getAllSchools);

router.patch('/:schoolId/activate', requirePermission('school:manage'), requireSuperAdmin, auditAuthorizedAccess('school.manage.activate'), schoolController.activateSchool);
router.patch('/:schoolId/deactivate', requirePermission('school:manage'), requireSuperAdmin, auditAuthorizedAccess('school.manage.deactivate'), schoolController.deactivateSchool);
router.put('/:schoolId/logo', requirePermission('school:manage'), requireAdmin, requireSchool, auditAuthorizedAccess('school.manage.logo_update'), schoolLogoUpload.single('logo'), schoolController.updateSchoolLogo);
router.get('/:schoolId', requirePermission('school:manage'), requireAdmin, requireSchool, auditAuthorizedAccess('school.manage.get'), schoolController.getSchoolById);
router.put('/:schoolId', requirePermission('school:manage'), requireAdmin, requireSchool, auditAuthorizedAccess('school.manage.update'), schoolController.updateSchool);

module.exports = router;
