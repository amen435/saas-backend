const prisma = require('../config/database');
const attendanceService = require('../services/attendance.service');
const { validateBulkAttendance, isValidAttendanceDate } = require('../utils/attendanceValidation');

const STATUS_MAP = {
  P: 'PRESENT',
  A: 'ABSENT',
  L: 'LATE',
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
};

/**
 * @route   POST /api/homeroom/classes/:classId/attendance
 * @desc    Record bulk attendance for a homeroom class (per date)
 * @access  HOMEROOM_TEACHER (active role) and must be homeroom of class
 *
 * Expected body:
 * {
 *   "date": "YYYY-MM-DD",
 *   "records": [{ "studentId": 123, "status": "P" | "A" | "L" | "PRESENT" | "ABSENT" | "LATE" }]
 * }
 */
const recordHomeroomClassAttendance = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const teacher = req.teacher; // from verifyHomeroomTeacher
    const classData = req.class; // from verifyHomeroomTeacher

    const { date, attendanceDate, records } = req.body || {};
    const finalDate = date || attendanceDate;

    console.log('[homeroom-attendance] incoming', {
      userId: req.user?.userId,
      schoolId,
      classId: classData?.classId,
      date: finalDate,
      recordsCount: Array.isArray(records) ? records.length : null,
    });

    if (!finalDate) {
      return res.status(400).json({
        success: false,
        error: 'date is required',
      });
    }

    if (!isValidAttendanceDate(finalDate)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot record attendance for future dates',
      });
    }

    const errors = validateBulkAttendance(records);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    // Normalize & validate studentIds belong to this class/school (active only)
    const rawRecords = (Array.isArray(records) ? records : []).map((r) => ({
      studentId: Number(r.studentId),
      status: STATUS_MAP[String(r.status || '').toUpperCase()],
      remarks: r.remarks,
    }));

    const invalid = rawRecords.filter((r) => !Number.isInteger(r.studentId) || r.studentId <= 0 || !r.status);
    if (invalid.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'One or more records have invalid studentId or status',
      });
    }

    const students = await prisma.student.findMany({
      where: {
        classId: classData.classId,
        schoolId,
        isActive: true,
      },
      select: { studentId: true },
    });
    const allowedIds = new Set(students.map((s) => s.studentId));
    const invalidIds = rawRecords.filter((r) => !allowedIds.has(r.studentId)).map((r) => r.studentId);
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid student IDs for this class: ${Array.from(new Set(invalidIds)).join(', ')}`,
      });
    }

    const results = await attendanceService.recordBulkAttendance(
      classData.classId,
      finalDate,
      rawRecords.map((r) => ({ studentId: r.studentId, status: r.status, remarks: r.remarks })),
      schoolId,
      teacher.teacherId
    );

    console.log('[homeroom-attendance] saved', {
      classId: classData.classId,
      date: finalDate,
      total: results.length,
    });

    return res.status(201).json({
      success: true,
      message: `Attendance recorded for ${results.length} students`,
      data: {
        classId: classData.classId,
        date: finalDate,
        totalRecorded: results.length,
      },
    });
  } catch (error) {
    console.error('[homeroom-attendance] error', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to record attendance',
    });
  }
};

/**
 * @route   GET /api/homeroom/classes/:classId/attendance?date=YYYY-MM-DD
 * @desc    Get class attendance for a specific date (homeroom-scoped)
 * @access  HOMEROOM_TEACHER (of this class)
 */
const getHomeroomClassAttendance = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const classData = req.class; // from verifyHomeroomTeacher
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'date query parameter is required',
      });
    }

    console.log('[homeroom-attendance] fetch', {
      userId: req.user?.userId,
      schoolId,
      classId: classData?.classId,
      date,
    });

    const result = await attendanceService.getClassAttendance(
      classData.classId,
      date,
      schoolId
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[homeroom-attendance] fetch error', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch attendance',
    });
  }
};

module.exports = {
  recordHomeroomClassAttendance,
  getHomeroomClassAttendance,
};

