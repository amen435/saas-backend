// src/routes/timetable.routes.js

const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetable.controller');
const timetableViewController = require('../controllers/timetableView.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

router.use(authenticateToken);

// Get period configurations
router.get('/periods', timetableController.getPeriodConfigurations);

// View timetables
router.get('/class/:classId', timetableController.getTimetableByClass);
router.get('/teacher/:teacherId', requireRole(['SCHOOL_ADMIN', 'TEACHER', 'HOMEROOM_TEACHER']), timetableController.getTimetableByTeacher);

// STUDENT: timetable preview for a specific student (used by StudentDashboard)
router.get(
  '/student/:studentId',
  requireRole(['STUDENT']),
  timetableViewController.getStudentTimetableById
);

// Manage timetables (SCHOOL_ADMIN only)
router.post('/', requireRole(['SCHOOL_ADMIN']), timetableController.createTimetable);
router.put('/:id', requireRole(['SCHOOL_ADMIN']), timetableController.updateTimetable);
router.delete('/:id', requireRole(['SCHOOL_ADMIN']), timetableController.deleteTimetable);

module.exports = router;