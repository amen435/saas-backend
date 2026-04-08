// src/controllers/attendance.controller.js
const prisma = require('../config/database');
const attendanceService = require('../services/attendance.service');
const {
  validateAttendanceData,
  validateBulkAttendance,
  isValidAttendanceDate,
} = require('../utils/attendanceValidation');

/**
 * @route   POST /api/attendance
 * @desc    Record attendance for single student
 * @access  TEACHER, HOMEROOM_TEACHER, SCHOOL_ADMIN
 */
const recordAttendance = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const data = req.body;

    // Validate input
    const errors = validateAttendanceData(data);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    // Validate date is not in future
    if (!isValidAttendanceDate(data.attendanceDate)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot record attendance for future dates',
      });
    }

    // Get teacher ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can record attendance',
      });
    }

    const attendance = await attendanceService.recordAttendance(
      data,
      schoolId,
      teacher.teacherId
    );

    res.status(201).json({
      success: true,
      message: 'Attendance recorded successfully',
      data: attendance,
    });
  } catch (error) {
    console.error('Record attendance error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to record attendance',
    });
  }
};

/**
 * @route   POST /api/attendance/bulk
 * @desc    Record bulk attendance for class
 * @access  TEACHER, HOMEROOM_TEACHER, SCHOOL_ADMIN
 */
const recordBulkAttendance = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { classId, attendanceDate, records } = req.body;

    if (!classId || !attendanceDate) {
      return res.status(400).json({
        success: false,
        error: 'classId and attendanceDate are required',
      });
    }

    // Validate records
    const errors = validateBulkAttendance(records);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    // Validate date
    if (!isValidAttendanceDate(attendanceDate)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot record attendance for future dates',
      });
    }

    // Get teacher ID
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Only teachers can record attendance',
      });
    }

    const results = await attendanceService.recordBulkAttendance(
      parseInt(classId),
      attendanceDate,
      records,
      schoolId,
      teacher.teacherId
    );

    res.status(201).json({
      success: true,
      message: `Attendance recorded for ${results.length} students`,
      data: {
        totalRecorded: results.length,
        date: attendanceDate,
      },
    });
  } catch (error) {
    console.error('Bulk attendance error:', error);

    if (error.message.includes('not found') || error.message.includes('Invalid')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to record bulk attendance',
    });
  }
};

/**
 * @route   GET /api/attendance/class/:classId
 * @desc    Get class attendance for a specific date
 * @access  TEACHER, HOMEROOM_TEACHER, SCHOOL_ADMIN
 */
const getClassAttendance = async (req, res) => {
  try {
    const { classId } = req.params;
    const { date } = req.query;
    const { schoolId } = req.user;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required',
      });
    }

    const result = await attendanceService.getClassAttendance(
      parseInt(classId),
      date,
      schoolId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get class attendance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch class attendance',
    });
  }
};

/**
 * @route   GET /api/attendance/student/:studentId
 * @desc    Get student attendance history
 * @access  TEACHER, HOMEROOM_TEACHER, STUDENT, PARENT, SCHOOL_ADMIN
 */
const getStudentAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId } = req.user;
    const { startDate, endDate, status } = req.query;

    const result = await attendanceService.getStudentAttendance(
      parseInt(studentId),
      schoolId,
      { startDate, endDate, status }
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get student attendance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch student attendance',
    });
  }
};

/**
 * @route   GET /api/attendance/report/class/:classId
 * @desc    Get class attendance report
 * @access  TEACHER, HOMEROOM_TEACHER, SCHOOL_ADMIN
 */
const getClassAttendanceReport = async (req, res) => {
  try {
    const { classId } = req.params;
    const { startDate, endDate } = req.query;
    const { schoolId } = req.user;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
      });
    }

    const result = await attendanceService.getClassAttendanceReport(
      parseInt(classId),
      startDate,
      endDate,
      schoolId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get attendance report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate attendance report',
    });
  }
};

/**
 * @route   DELETE /api/attendance/:attendanceId
 * @desc    Delete attendance record
 * @access  TEACHER, HOMEROOM_TEACHER, SCHOOL_ADMIN
 */
const deleteAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { schoolId } = req.user;

    const result = await attendanceService.deleteAttendance(
      parseInt(attendanceId),
      schoolId
    );

    res.status(200).json({
      success: true,
      message: 'Attendance record deleted successfully',
      data: result,
    });
  } catch (error) {
    console.error('Delete attendance error:', error);

    if (error.message === 'Attendance record not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete attendance record',
    });
  }
};

module.exports = {
  recordAttendance,
  recordBulkAttendance,
  getClassAttendance,
  getStudentAttendance,
  getClassAttendanceReport,
  deleteAttendance,
};