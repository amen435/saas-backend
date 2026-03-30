// src/routes/homeroom.routes.js

const express = require('express');
const router = express.Router();
const homeroomController = require('../controllers/homeroom.controller');
const homeroomAttendanceController = require('../controllers/homeroomAttendance.controller');
const parentController = require('../controllers/parent.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const {
  verifyHomeroomTeacher,
  verifyStudentInHomeroomClass
} = require('../middleware/homeroom.middleware');

// All routes require TEACHER authentication
router.use(authenticateToken);
router.use(requireRole(['TEACHER', 'HOMEROOM_TEACHER']));

/**
 * @route   GET /api/homeroom/my-homeroom-classes
 * @desc    Get classes where teacher is homeroom teacher
 * @access  TEACHER (who is homeroom)
 */
router.get('/my-homeroom-classes', homeroomController.getMyHomeroomClasses);

/**
 * @route   POST /api/homeroom/classes/:classId/attendance
 * @desc    Record bulk attendance for a homeroom class
 * @access  HOMEROOM_TEACHER (of this class)
 */
router.post(
  '/classes/:classId/attendance',
  verifyHomeroomTeacher,
  homeroomAttendanceController.recordHomeroomClassAttendance
);

/**
 * @route   GET /api/homeroom/classes/:classId/attendance
 * @query   ?date=YYYY-MM-DD
 * @desc    Get class attendance for a specific date
 * @access  HOMEROOM_TEACHER (of this class)
 */
router.get(
  '/classes/:classId/attendance',
  verifyHomeroomTeacher,
  homeroomAttendanceController.getHomeroomClassAttendance
);

/**
 * @route   POST /api/homeroom/classes/:classId/students
 * @desc    Create student in homeroom class
 * @access  HOMEROOM_TEACHER (of this class)
 */
router.post(
  '/classes/:classId/students',
  verifyHomeroomTeacher,
  homeroomController.createStudent
);

/**
 * @route   GET /api/homeroom/classes/:classId/students
 * @desc    Get students in homeroom class
 * @access  HOMEROOM_TEACHER (of this class)
 */
router.get(
  '/classes/:classId/students',
  verifyHomeroomTeacher,
  homeroomController.getHomeroomStudents
);

/**
 * @route   GET /api/homeroom/students/:studentId
 * @desc    Get single student details
 * @access  HOMEROOM_TEACHER (of student's class)
 */
router.get(
  '/students/:studentId',
  verifyStudentInHomeroomClass,
  homeroomController.getStudentById
);

/**
 * @route   PUT /api/homeroom/students/:studentId
 * @desc    Update student basic info
 * @access  HOMEROOM_TEACHER (of student's class)
 */
router.put(
  '/students/:studentId',
  verifyStudentInHomeroomClass,
  homeroomController.updateStudent
);

/**
 * @route   PATCH /api/homeroom/students/:studentId/deactivate
 * @desc    Deactivate student
 * @access  HOMEROOM_TEACHER (of student's class)
 */
router.patch(
  '/students/:studentId/deactivate',
  verifyStudentInHomeroomClass,
  homeroomController.deactivateStudent
);

/**
 * @route   PATCH /api/homeroom/students/:studentId/activate
 * @desc    Activate student
 * @access  HOMEROOM_TEACHER
 */
router.patch(
  '/students/:studentId/activate',
  verifyStudentInHomeroomClass,
  homeroomController.activateStudent
);

/**
 * @route   DELETE /api/homeroom/students/:studentId
 * @desc    Delete student account (hard delete)
 * @access  HOMEROOM_TEACHER
 */
router.delete(
  '/students/:studentId',
  verifyStudentInHomeroomClass,
  homeroomController.deleteStudent
);
// ============================================
// PARENT ROUTES
// ============================================

/**
 * @route   POST /api/homeroom/classes/:classId/parents
 * @desc    Create parent
 */
router.post(
  '/classes/:classId/parents',
  verifyHomeroomTeacher,
  parentController.createParent
);

/**
 * @route   GET /api/homeroom/classes/:classId/parents
 * @desc    Get parents in class
 */
router.get(
  '/classes/:classId/parents',
  verifyHomeroomTeacher,
  parentController.getClassParents
);

/**
 * @route   GET /api/homeroom/parents/:parentId
 * @desc    Get single parent
 */
router.get(
  '/parents/:parentId',
  parentController.getParentById
);

/**
 * @route   PUT /api/homeroom/parents/:parentId
 * @desc    Update parent
 */
router.put(
  '/parents/:parentId',
  parentController.updateParent
);

/**
 * @route   POST /api/homeroom/classes/:classId/parents/:parentId/add-child
 * @desc    Add child to parent
 */
router.post(
  '/classes/:classId/parents/:parentId/add-child',
  verifyHomeroomTeacher,
  parentController.addChildToParent
);

/**
 * @route   DELETE /api/homeroom/parents/:parentId/children/:studentId
 * @desc    Remove child from parent
 */
router.delete(
  '/parents/:parentId/children/:studentId',
  parentController.removeChildFromParent
);
module.exports = router;