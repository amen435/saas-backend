// src/routes/subject.routes.js

const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subject.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole, requireAdmin } = require('../middleware/rbac.middleware');

// All routes require authentication
router.use(authenticateToken);

/**
 * @route   GET /api/subjects
 * @desc    Get all subjects
 * @access  SUPER_ADMIN, SCHOOL_ADMIN, TEACHER
 */
router.get(
  '/',
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  subjectController.getAllSubjects
);

/**
 * @route   GET /api/subjects/:id
 * @desc    Get single subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN, TEACHER
 */
router.get(
  '/:id',
  requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']),
  subjectController.getSubjectById
);

/**
 * @route   POST /api/subjects
 * @desc    Create subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.post('/', requireAdmin, subjectController.createSubject);

/**
 * @route   PUT /api/subjects/:id
 * @desc    Update subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.put('/:id', requireAdmin, subjectController.updateSubject);

/**
 * @route   DELETE /api/subjects/:id
 * @desc    Delete subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.delete('/:id', requireAdmin, subjectController.deleteSubject);

/**
 * @route   POST /api/subjects/:id/assign-teacher
 * @desc    Assign teacher to subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.post('/:id/assign-teacher', requireAdmin, subjectController.assignTeacher);

/**
 * @route   DELETE /api/subjects/:id/remove-teacher/:teacherId
 * @desc    Remove teacher from subject
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.delete('/:id/remove-teacher/:teacherId', requireAdmin, subjectController.removeTeacher);

/**
 * @route   GET /api/teachers
 * @desc    Get all teachers (for assignment)
 * @access  SUPER_ADMIN, SCHOOL_ADMIN
 */
router.get('/list/teachers', requireAdmin, subjectController.getSchoolTeachers);

module.exports = router;