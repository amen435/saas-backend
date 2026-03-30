// src/ai/controllers/aiAnalytics.controller.js

const aiAnalyticsService = require('../services/aiAnalytics.service');
const prisma = require('../../config/database');

/**
 * @route   GET /api/ai/analytics/student-performance/:studentId
 * @desc    Analyze student performance
 * @access  TEACHER, HOMEROOM_TEACHER, SCHOOL_ADMIN
 */
const analyzeStudentPerformance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    // Verify student belongs to school
    const student = await prisma.student.findFirst({
      where: {
        studentId: parseInt(studentId),
        schoolId,
      },
      include: {
        user: {
          select: {
            fullName: true,
          },
        },
        class: {
          select: {
            className: true,
          },
        },
      },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found in this school',
      });
    }

    const analysis = await aiAnalyticsService.analyzeStudentPerformance(
      parseInt(studentId),
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: {
        student: {
          studentId: student.studentId,
          name: student.user.fullName,
          class: student.class?.className,
        },
        academicYear,
        analysis,
      },
    });
  } catch (error) {
    console.error('Analyze student performance error:', error);

    if (error.message.includes('not available')) {
      return res.status(503).json({
        success: false,
        error: 'AI service is currently unavailable',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to analyze student performance',
    });
  }
};

/**
 * @route   GET /api/ai/analytics/attendance-trends/:studentId
 * @desc    Analyze student attendance trends
 * @access  TEACHER, HOMEROOM_TEACHER, SCHOOL_ADMIN, PARENT
 */
const analyzeAttendanceTrends = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId, role, userId } = req.user;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required',
      });
    }

    // If parent, verify they have access to this student
    if (role === 'PARENT') {
      const parent = await prisma.parent.findFirst({
        where: { userId, schoolId },
      });

      if (parent) {
        const relationship = await prisma.parentStudent.findFirst({
          where: {
            parentId: parent.parentId,
            studentId: parseInt(studentId),
          },
        });

        if (!relationship) {
          return res.status(403).json({
            success: false,
            error: 'You do not have access to this student',
          });
        }
      }
    }

    // Verify student belongs to school
    const student = await prisma.student.findFirst({
      where: {
        studentId: parseInt(studentId),
        schoolId,
      },
      include: {
        user: {
          select: {
            fullName: true,
          },
        },
      },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found in this school',
      });
    }

    const analysis = await aiAnalyticsService.analyzeAttendanceTrends(
      parseInt(studentId),
      schoolId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      data: {
        student: {
          studentId: student.studentId,
          name: student.user.fullName,
        },
        period: {
          startDate,
          endDate,
        },
        analysis,
      },
    });
  } catch (error) {
    console.error('Analyze attendance trends error:', error);

    if (error.message.includes('not available')) {
      return res.status(503).json({
        success: false,
        error: 'AI service is currently unavailable',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to analyze attendance trends',
    });
  }
};

/**
 * @route   GET /api/ai/analytics/at-risk-students/:classId
 * @desc    Identify students at risk
 * @access  TEACHER, HOMEROOM_TEACHER, SCHOOL_ADMIN
 */
const identifyAtRiskStudents = async (req, res) => {
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

    // Verify class belongs to school
    const classData = await prisma.class.findFirst({
      where: {
        classId: parseInt(classId),
        schoolId,
      },
      select: {
        className: true,
      },
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found in this school',
      });
    }

    const analysis = await aiAnalyticsService.identifyAtRiskStudents(
      parseInt(classId),
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: {
        class: classData,
        academicYear,
        ...analysis,
      },
    });
  } catch (error) {
    console.error('Identify at-risk students error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to identify at-risk students',
    });
  }
};

/**
 * @route   GET /api/ai/analytics/class-performance/:classId
 * @desc    Compare class performance
 * @access  TEACHER, HOMEROOM_TEACHER, SCHOOL_ADMIN
 */
const compareClassPerformance = async (req, res) => {
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

    // Verify class belongs to school
    const classData = await prisma.class.findFirst({
      where: {
        classId: parseInt(classId),
        schoolId,
      },
      select: {
        className: true,
        gradeLevel: true,
      },
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found in this school',
      });
    }

    const analysis = await aiAnalyticsService.compareClassPerformance(
      parseInt(classId),
      schoolId,
      academicYear
    );

    res.status(200).json({
      success: true,
      data: {
        class: classData,
        academicYear,
        analysis,
      },
    });
  } catch (error) {
    console.error('Compare class performance error:', error);

    if (error.message.includes('not available')) {
      return res.status(503).json({
        success: false,
        error: 'AI service is currently unavailable',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to compare class performance',
    });
  }
};

/**
 * @route   GET /api/ai/analytics/performance-trends/:studentId
 * @desc    Get performance trends over time
 * @access  TEACHER, HOMEROOM_TEACHER, SCHOOL_ADMIN, STUDENT, PARENT
 */
const getPerformanceTrends = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId, role, userId } = req.user;

    // If student, verify it's their own data
    if (role === 'STUDENT') {
      const student = await prisma.student.findFirst({
        where: {
          studentId: parseInt(studentId),
          userId,
          schoolId,
        },
      });

      if (!student) {
        return res.status(403).json({
          success: false,
          error: 'You can only view your own performance trends',
        });
      }
    }

    // If parent, verify access
    if (role === 'PARENT') {
      const parent = await prisma.parent.findFirst({
        where: { userId, schoolId },
      });

      if (parent) {
        const relationship = await prisma.parentStudent.findFirst({
          where: {
            parentId: parent.parentId,
            studentId: parseInt(studentId),
          },
        });

        if (!relationship) {
          return res.status(403).json({
            success: false,
            error: 'You do not have access to this student',
          });
        }
      }
    }

    const trends = await aiAnalyticsService.getPerformanceTrends(
      parseInt(studentId),
      schoolId
    );

    res.status(200).json({
      success: true,
      data: trends,
    });
  } catch (error) {
    console.error('Get performance trends error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch performance trends',
    });
  }
};

/**
 * @route   GET /api/ai/analytics/school-overview
 * @desc    Get school-wide analytics overview
 * @access  SCHOOL_ADMIN
 */
const getSchoolOverview = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { academicYear } = req.query;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        error: 'Academic year is required',
      });
    }

    // Get total students
    const totalStudents = await prisma.student.count({
      where: { schoolId, isActive: true },
    });

    // Get average performance
    const grades = await prisma.studentGrade.findMany({
      where: { schoolId, academicYear },
    });

    const averagePerformance = grades.length > 0
      ? grades.reduce((sum, g) => sum + g.percentage, 0) / grades.length
      : 0;

    // Get attendance rate
    const today = new Date();
    const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30));

    const attendance = await prisma.attendance.findMany({
      where: {
        schoolId,
        attendanceDate: {
          gte: thirtyDaysAgo,
        },
      },
    });

    const attendanceRate = attendance.length > 0
      ? (attendance.filter(a => a.status === 'PRESENT').length / attendance.length) * 100
      : 0;

    // Get failing students count
    const failingStudents = await prisma.studentGrade.groupBy({
      by: ['studentId'],
      where: {
        schoolId,
        academicYear,
        status: 'FAIL',
      },
      having: {
        studentId: {
          _count: {
            gte: 2, // Failing 2 or more subjects
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalStudents,
          averagePerformance: averagePerformance.toFixed(2),
          attendanceRate: attendanceRate.toFixed(2),
          atRiskStudents: failingStudents.length,
        },
        academicYear,
      },
    });
  } catch (error) {
    console.error('Get school overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch school overview',
    });
  }
};

/**
 * @route   GET /api/ai/analytics/platform-overview
 * @desc    Get platform-wide analytics overview
 * @access  SUPER_ADMIN
 */
const getPlatformOverview = async (req, res) => {
  try {
    const analytics = await aiAnalyticsService.getPlatformOverview();

    res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Get platform overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch platform overview',
    });
  }
};

module.exports = {
  analyzeStudentPerformance,
  analyzeAttendanceTrends,
  identifyAtRiskStudents,
  compareClassPerformance,
  getPerformanceTrends,
  getSchoolOverview,
  getPlatformOverview,
};
