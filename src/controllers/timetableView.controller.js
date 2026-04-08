// src/controllers/timetableView.controller.js

const timetableViewService = require('../services/timetableView.service');
const prisma = require('../config/database');

/**
 * @route   GET /api/timetable/view/class/:classId
 * @desc    Get timetable for a class
 * @access  STUDENT, PARENT, TEACHER, SCHOOL_ADMIN
 */
const getClassTimetable = async (req, res) => {
  try {
    const { classId } = req.params;
    const { schoolId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    const timetable = await timetableViewService.getClassTimetable(
      parseInt(classId),
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: timetable,
    });
  } catch (error) {
    console.error('Get class timetable error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch class timetable',
    });
  }
};

/**
 * @route   GET /api/timetable/view/teacher/:teacherId
 * @desc    Get timetable for a teacher
 * @access  TEACHER, SCHOOL_ADMIN
 */
const getTeacherTimetable = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { schoolId, role, userId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    // If user is a teacher, verify they can only view their own timetable
    if (role === 'TEACHER' || role === 'HOMEROOM_TEACHER') {
      const teacher = await prisma.teacher.findFirst({
        where: {
          teacherId: parseInt(teacherId),
          userId,
          schoolId,
        },
      });

      if (!teacher) {
        return res.status(403).json({
          success: false,
          error: 'You can only view your own timetable',
        });
      }
    }

    const timetable = await timetableViewService.getTeacherTimetable(
      parseInt(teacherId),
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: timetable,
    });
  } catch (error) {
    console.error('Get teacher timetable error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch teacher timetable',
    });
  }
};

/**
 * @route   GET /api/timetable/view/student/my-timetable
 * @desc    Get timetable for logged-in student
 * @access  STUDENT
 */
const getMyTimetable = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    // Get student record from userId
    const student = await prisma.student.findFirst({
      where: {
        userId,
        schoolId,
      },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student record not found',
      });
    }

    const timetable = await timetableViewService.getStudentTimetable(
      student.studentId,
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: timetable,
    });
  } catch (error) {
    console.error('Get student timetable error:', error);

    if (error.message.includes('not found') || error.message.includes('not assigned')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch student timetable',
    });
  }
};

/**
 * @route   GET /api/timetable/student/:studentId
 * @desc    Get timetable for a specific student (STUDENT role only)
 * @access  STUDENT
 */
const getStudentTimetableById = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId, userId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    const parsedStudentId = parseInt(studentId, 10);
    if (!Number.isInteger(parsedStudentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid studentId',
      });
    }

    // Ensure the logged-in STUDENT owns this studentId.
    const student = await prisma.student.findFirst({
      where: { studentId: parsedStudentId, schoolId },
      select: { studentId: true, userId: true },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student record not found',
      });
    }

    if (String(student.userId) !== String(userId)) {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own timetable',
      });
    }

    const timetable = await timetableViewService.getStudentTimetable(
      parsedStudentId,
      schoolId,
      academicYear
    );

    return res.status(200).json({
      success: true,
      data: timetable,
    });
  } catch (error) {
    console.error('Get student timetable (by id) error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch student timetable',
    });
  }
};

/**
 * @route   GET /api/timetable/view/parent/child/:studentId
 * @desc    Get timetable for parent's child
 * @access  PARENT
 */
const getChildTimetable = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId, userId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    // Get parent record from userId
    const parent = await prisma.parent.findFirst({
      where: {
        userId,
        schoolId,
      },
    });

    if (!parent) {
      return res.status(404).json({
        success: false,
        error: 'Parent record not found',
      });
    }

    const timetable = await timetableViewService.getParentChildTimetable(
      parent.parentId,
      parseInt(studentId),
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: timetable,
    });
  } catch (error) {
    console.error('Get child timetable error:', error);

    if (error.message.includes('not found') || error.message.includes('not associated')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch child timetable',
    });
  }
};

/**
 * @route   GET /api/timetable/view/parent/all-children
 * @desc    Get timetables for all children of logged-in parent
 * @access  PARENT
 */
const getAllChildrenTimetables = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    // Get parent record
    const parent = await prisma.parent.findFirst({
      where: {
        userId,
        schoolId,
      },
    });

    console.log('parent:', parent);

    if (!parent) {
      return res.status(404).json({
        success: false,
        error: 'Parent record not found',
      });
    }

    const children = await prisma.parentStudent.findMany({
      where: { parentId: parent.parentId },
      select: {
        student: {
          select: {
            studentId: true,
            classId: true,
            schoolId: true,
          },
        },
      },
    });
    console.log('children:', children);

    const classIds = (children || [])
      .map((c) => c?.student?.classId)
      .filter((id) => id != null);
    console.log('classIds:', classIds);

    if (!children || children.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const timetables = await timetableViewService.getAllChildrenTimetables(
      parent.parentId,
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: Array.isArray(timetables) ? timetables : [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch children timetables',
    });
  }
};

/**
 * @route   GET /api/timetable/view/day/:classId/:dayOfWeek
 * @desc    Get timetable for a specific day
 * @access  Authenticated users
 */
const getDayTimetable = async (req, res) => {
  try {
    const { classId, dayOfWeek } = req.params;
    const { schoolId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    const validDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    if (!validDays.includes(dayOfWeek.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid day of week',
      });
    }

    const timetable = await timetableViewService.getDayTimetable(
      parseInt(classId),
      dayOfWeek.toUpperCase(),
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: {
        classId: parseInt(classId),
        dayOfWeek: dayOfWeek.toUpperCase(),
        academicYear,
        entries: timetable,
      },
    });
  } catch (error) {
    console.error('Get day timetable error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch day timetable',
    });
  }
};

module.exports = {
  getClassTimetable,
  getTeacherTimetable,
  getMyTimetable,
  getStudentTimetableById,
  getChildTimetable,
  getAllChildrenTimetables,
  getDayTimetable,
};