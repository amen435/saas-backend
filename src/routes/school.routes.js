const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/school.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireSuperAdmin } = require('../middleware/rbac.middleware');
const { createImageUpload } = require('../middleware/upload.middleware');

const schoolLogoUpload = createImageUpload('school-logos', 'school-logo');

router.use(authenticateToken);

router.post('/check-expiry', requireSuperAdmin, schoolController.checkExpiredSchools);
router.post('/', requireSuperAdmin, schoolController.createSchool);
router.get('/', requireSuperAdmin, schoolController.getAllSchools);

router.patch('/:schoolId/activate', requireSuperAdmin, schoolController.activateSchool);
router.patch('/:schoolId/deactivate', requireSuperAdmin, schoolController.deactivateSchool);
router.put('/:schoolId/logo', requireAdmin, schoolLogoUpload.single('logo'), schoolController.updateSchoolLogo);
router.get('/:schoolId', requireAdmin, schoolController.getSchoolById);
router.put('/:schoolId', requireAdmin, schoolController.updateSchool);

module.exports = router;
