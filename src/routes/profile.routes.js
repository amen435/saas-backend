const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { createImageUpload } = require('../middleware/upload.middleware');
const { requireAnyPermission } = require('../middleware/rbac.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

const profileUpload = createImageUpload('profile-images', 'profile-photo');

router.use(authenticateToken);
router.use(
  requireAnyPermission([
    'messages:read',
    'messages:write',
    'attendance:read',
    'attendance:read:self',
    'attendance:read:child',
    'school:manage',
    'system:admin',
  ])
);

router.get('/', auditAuthorizedAccess('profile.read.self'), profileController.getProfile);
router.put('/photo', auditAuthorizedAccess('profile.write.photo'), profileUpload.single('photo'), profileController.updateProfilePhoto);

module.exports = router;
