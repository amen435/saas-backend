const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { createImageUpload } = require('../middleware/upload.middleware');

const profileUpload = createImageUpload('profile-images', 'profile-photo');

router.use(authenticateToken);

router.get('/', profileController.getProfile);
router.put('/photo', profileUpload.single('photo'), profileController.updateProfilePhoto);

module.exports = router;
