const express = require('express');
const router = express.Router();
const reportCardController = require('../controllers/reportCard.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAnyPermission } = require('../middleware/rbac.middleware');
const {
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
} = require('../middleware/ownership.middleware');

/**
 * GET /api/report-cards/:studentId/:termId
 * Preview report card JSON for a student and term.
 */
router.get(
  '/:studentId/:termId',
  authenticateToken,
  requireAnyPermission(['grades:read', 'grades:read:self', 'grades:read:child', 'school:manage']),
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
  reportCardController.previewReportCard
);

/**
 * GET /api/report-cards/:studentId/:termId/pdf
 * Download report card PDF for a student and term.
 */
router.get(
  '/:studentId/:termId/pdf',
  authenticateToken,
  requireAnyPermission(['grades:read', 'grades:read:self', 'grades:read:child', 'school:manage']),
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
  reportCardController.downloadReportCard
);

module.exports = router;
