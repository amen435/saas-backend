// src/routes/announcement.routes.js

const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcement.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * Get announcements (all authenticated users)
 */
router.get(
  '/',
  announcementController.getAnnouncements
);

router.get(
  '/:id',
  announcementController.getAnnouncementById
);

/**
 * SCHOOL_ADMIN only routes
 */
router.post(
  '/',
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  announcementController.createAnnouncement
);

router.put(
  '/:id',
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  announcementController.updateAnnouncement
);

router.delete(
  '/:id',
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  announcementController.deleteAnnouncement
);

router.patch(
  '/:id/deactivate',
  requireRole(['SCHOOL_ADMIN']),
  announcementController.deactivateAnnouncement
);

/**
 * Statistics (SCHOOL_ADMIN only)
 */
router.get(
  '/stats/overview',
  requireRole(['SCHOOL_ADMIN']),
  announcementController.getAnnouncementStats
);

module.exports = router;