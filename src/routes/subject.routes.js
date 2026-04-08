// src/routes/subject.routes.js

const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subject.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAdmin, requireAnyPermission } = require('../middleware/rbac.middleware');
const { auditAuthorizedAccess } = require('../middleware/auditAccess.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/subjects
 * @desc    Get all subjects
 * @access  SUPER_ADMIN, SCHOOL_ADMIN, TEACHER
 */
router.get(
  '/',
  requireAnyPermission(['grades:read', 'school:manage']),
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  auditAuthorizedAccess('subjects.read.list'),
  subjectController.getAllSubjects
);

/**
 * @route   GET /api/subjects/:id
 * @desc    Get single subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN, TEACHER
 */
router.get(
  '/:id',
  requireAnyPermission(['grades:read', 'school:manage']),
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  auditAuthorizedAccess('subjects.read.single'),
  subjectController.getSubjectById
);

/**
 * @route   POST /api/subjects
 * @desc    Create subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.post('/', requireAnyPermission(['school:manage']), requireAdmin, auditAuthorizedAccess('subjects.write.create'), subjectController.createSubject);

/**
 * @route   PUT /api/subjects/:id
 * @desc    Update subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.put('/:id', requireAnyPermission(['school:manage']), requireAdmin, auditAuthorizedAccess('subjects.write.update'), subjectController.updateSubject);

/**
 * @route   DELETE /api/subjects/:id
 * @desc    Delete subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.delete('/:id', requireAnyPermission(['school:manage']), requireAdmin, auditAuthorizedAccess('subjects.write.delete'), subjectController.deleteSubject);

/**
 * @route   POST /api/subjects/:id/assign-teacher
 * @desc    Assign teacher to subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.post('/:id/assign-teacher', requireAnyPermission(['school:manage']), requireAdmin, auditAuthorizedAccess('subjects.write.assign_teacher'), subjectController.assignTeacher);

/**
 * @route   DELETE /api/subjects/:id/remove-teacher/:teacherId
 * @desc    Remove teacher from subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.delete('/:id/remove-teacher/:teacherId', requireAnyPermission(['school:manage']), requireAdmin, auditAuthorizedAccess('subjects.write.remove_teacher'), subjectController.removeTeacher);

/**
 * @route   GET /api/teachers
 * @desc    Get all teachers (for assignment)
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.get('/list/teachers', requireAnyPermission(['school:manage']), requireAdmin, auditAuthorizedAccess('subjects.read.teachers'), subjectController.getSchoolTeachers);

module.exports = router;