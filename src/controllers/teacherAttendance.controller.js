// src/controllers/teacherAttendance.controller.js

const teacherAttendanceService = require('../services/teacherAttendance.service');
const prisma = require('../config/database');
const {
  validateTeacherAttendanceData,
  validateBulkTeacherAttendance,
  isValidAttendanceDate,
} = require('../utils/teacherAttendanceValidation');

/**
 * @route   POST /api/teacher-attendance
 * @desc    Record attendance for single teacher
 * @access  SCHOOL_ADMIN only
 */
const recordTeacherAttendance = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const data = req.body;

    // Validate input
    const errors = validateTeacherAttendanceData(data);
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

    const attendance = await teacherAttendanceService.recordTeacherAttendance(
      data,
      schoolId,
      userId
    );

    res.status(201).json({
      success: true,
      message: 'Teacher attendance recorded successfully',
      data: attendance,
    });
  } catch (error) {
    console.error('Record teacher attendance error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to record teacher attendance',
    });
  }
};

/**
 * @route   POST /api/teacher-attendance/bulk
 * @desc    Record bulk attendance for multiple teachers
 * @access  SCHOOL_ADMIN only
 */
const recordBulkTeacherAttendance = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { attendanceDate, records } = req.body;

    if (!attendanceDate) {
      return res.status(400).json({
        success: false,
        error: 'attendanceDate is required',
      });
    }

    // Validate records
    const errors = validateBulkTeacherAttendance(records);
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

    const results = await teacherAttendanceService.recordBulkTeacherAttendance(
      attendanceDate,
      records,
      schoolId,
      userId
    );

    res.status(201).json({
      success: true,
      message: `Attendance recorded for ${results.length} teachers`,
      data: {
        totalRecorded: results.length,
        date: attendanceDate,
      },
    });
  } catch (error) {
    console.error('Bulk teacher attendance error:', error);

    if (error.message.includes('Invalid')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to record bulk teacher attendance',
    });
  }
};

/**
 * @route   GET /api/teacher-attendance/school
 * @desc    Get all teachers attendance for a specific date
 * @access  SCHOOL_ADMIN only
 */
const getSchoolTeacherAttendance = async (req, res) => {
  try {
    const { date } = req.query;
    const { schoolId } = req.user;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required',
      });
    }

    const result = await teacherAttendanceService.getSchoolTeacherAttendance(
      schoolId,
      date
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get school teacher attendance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teacher attendance',
    });
  }
};

/**
 * @route   GET /api/teacher-attendance/teacher/:teacherId
 * @desc    Get attendance history for a specific teacher
 * @access  SCHOOL_ADMIN only
 */
const getTeacherAttendanceHistory = async (req, res) => {
  try {
    const { teacherId: teacherIdParam } = req.params;
    const { schoolId, role, userId } = req.user;
    const { startDate, endDate, status } = req.query;
    let teacherId = parseInt(teacherIdParam, 10);

    // Teachers can only view their own attendance, never another teacher's records.
    if (role === 'TEACHER' || role === 'HOMEROOM_TEACHER') {
      const me = await prisma.teacher.findFirst({
        where: { userId, schoolId },
        select: { teacherId: true },
      });

      if (!me) {
        return res.status(404).json({
          success: false,
          error: 'Teacher record not found',
        });
      }

      if (teacherId !== me.teacherId) {
        return res.status(403).json({
          success: false,
          error: 'You can only view your own attendance records',
        });
      }
    }

    const result = await teacherAttendanceService.getTeacherAttendanceHistory(
      teacherId,
      schoolId,
      { startDate, endDate, status }
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Get teacher attendance history error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch teacher attendance history',
    });
  }
};

/**
 * @route   GET /api/teacher-attendance/report
 * @desc    Get attendance report for all teachers
 * @access  SCHOOL_ADMIN only
 */
const getSchoolAttendanceReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { schoolId } = req.user;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
      });
    }

    const result = await teacherAttendanceService.getSchoolAttendanceReport(
      schoolId,
      startDate,
      endDate
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
 * @route   PUT /api/teacher-attendance/:attendanceId
 * @desc    Update teacher attendance
 * @access  SCHOOL_ADMIN only
 */
const updateTeacherAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { schoolId, userId } = req.user;
    const data = req.body;

    if (!data.status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    const validStatuses = ['PRESENT', 'ABSENT', 'LATE'];
    if (!validStatuses.includes(data.status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be PRESENT, ABSENT, or LATE',
      });
    }

    const updated = await teacherAttendanceService.updateTeacherAttendance(
      parseInt(attendanceId),
      data,
      schoolId,
      userId
    );

    res.status(200).json({
      success: true,
      message: 'Teacher attendance updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update teacher attendance error:', error);

    if (error.message === 'Attendance record not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update teacher attendance',
    });
  }
};

/**
 * @route   DELETE /api/teacher-attendance/:attendanceId
 * @desc    Delete teacher attendance record
 * @access  SCHOOL_ADMIN only
 */
const deleteTeacherAttendance = async (req, res) => {
  try {
    const { attendanceId } = req.params;
    const { schoolId } = req.user;

    const result = await teacherAttendanceService.deleteTeacherAttendance(
      parseInt(attendanceId),
      schoolId
    );

    res.status(200).json({
      success: true,
      message: 'Teacher attendance record deleted successfully',
      data: result,
    });
  } catch (error) {
    console.error('Delete teacher attendance error:', error);

    if (error.message === 'Attendance record not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete teacher attendance record',
    });
  }
};

module.exports = {
  recordTeacherAttendance,
  recordBulkTeacherAttendance,
  getSchoolTeacherAttendance,
  getTeacherAttendanceHistory,
  getSchoolAttendanceReport,
  updateTeacherAttendance,
  deleteTeacherAttendance,
};