// src/routes/announcement.routes.js

const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcement.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAnyPermission } = require('../middleware/rbac.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * Get announcements (all authenticated users)
 */
router.get(
  '/',
  requireAnyPermission(['messages:read', 'school:manage']),
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT']),
  auditAuthorizedAccess('announcements.read.list'),
  announcementController.getAnnouncements
);

router.get(
  '/:id',
  requireAnyPermission(['messages:read', 'school:manage']),
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER', 'STUDENT', 'PARENT']),
  auditAuthorizedAccess('announcements.read.single'),
  announcementController.getAnnouncementById
);

/**
 * SCHOOL_ADMIN only routes
 */
router.post(
  '/',
  requireAnyPermission(['messages:write', 'school:manage']),
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  auditAuthorizedAccess('announcements.write.create'),
  announcementController.createAnnouncement
);

router.put(
  '/:id',
  requireAnyPermission(['messages:write', 'school:manage']),
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  auditAuthorizedAccess('announcements.write.update'),
  announcementController.updateAnnouncement
);

router.delete(
  '/:id',
  requireAnyPermission(['messages:write', 'school:manage']),
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  auditAuthorizedAccess('announcements.write.delete'),
  announcementController.deleteAnnouncement
);

router.patch(
  '/:id/deactivate',
  requireAnyPermission(['school:manage']),
  requireRole(['SCHOOL_ADMIN']),
  auditAuthorizedAccess('announcements.write.deactivate'),
  announcementController.deactivateAnnouncement
);

/**
 * Statistics (SCHOOL_ADMIN only)
 */
router.get(
  '/stats/overview',
  requireAnyPermission(['school:manage']),
  requireRole(['SCHOOL_ADMIN']),
  auditAuthorizedAccess('announcements.read.stats'),
  announcementController.getAnnouncementStats
);

module.exports = router;