// src/controllers/teacher.controller.js

const prisma = require('../config/database');

// Admin functions (for School Admin to manage teachers)
const createTeacher = async (req, res) => {
  // ... (your existing create teacher code)
};

const getAllTeachers = async (req, res) => {
  // ... (your existing get all teachers code)
};

const getTeacherById = async (req, res) => {
  // ... (your existing get teacher by id code)
};

const updateTeacher = async (req, res) => {
  // ... (your existing update teacher code)
};

const deactivateTeacher = async (req, res) => {
  // ... (your existing deactivate teacher code)
};

// ============================================
// NEW: Teacher self-service functions
// ============================================

const getMyClasses = async (req, res) => {
  try {
    const { schoolId, userId: teacherUserId } = req.user;

    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherUserId,
        schoolId
      }
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher record not found'
      });
    }

    const classAssignments = await prisma.classTeacher.findMany({
      where: {
        teacherId: teacher.teacherId
      },
      include: {
        class: {
          include: {
            homeroomTeacher: {
              include: {
                user: {
                  select: {
                    fullName: true
                  }
                }
              }
            },
            _count: {
              select: {
                students: true
              }
            }
          }
        }
      }
    });

    const classes = classAssignments.map(ca => ({
      ...ca.class,
      subjectTaught: ca.subjectName,
      isHomeroom: ca.class.homeroomTeacherId === teacher.teacherId
    }));

    res.status(200).json({
      success: true,
      count: classes.length,
      data: classes
    });

  } catch (error) {
    console.error('Get my classes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch classes'
    });
  }
};

const getClassStudents = async (req, res) => {
  try {
    const { classId } = req.params;
    const { schoolId, userId: teacherUserId } = req.user;

    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherUserId,
        schoolId
      }
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher record not found'
      });
    }

    // Verify teacher teaches this class
    const teachesClass = await prisma.classTeacher.findFirst({
      where: {
        teacherId: teacher.teacherId,
        classId: parseInt(classId)
      }
    });

    if (!teachesClass) {
      return res.status(403).json({
        success: false,
        error: 'You do not teach this class'
      });
    }

    // Get students
    const students = await prisma.student.findMany({
      where: {
        classId: parseInt(classId),
        schoolId,
        isActive: true
      },
      include: {
        user: {
          select: {
            userId: true,
            username: true,
            fullName: true,
            email: true,
            phone: true
          }
        }
      },
      orderBy: {
        user: {
          fullName: 'asc'
        }
      }
    });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students
    });

  } catch (error) {
    console.error('Get class students error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students'
    });
  }
};

const getMyProfile = async (req, res) => {
  try {
    const { schoolId, userId: teacherUserId } = req.user;

    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherUserId,
        schoolId
      },
      include: {
        user: true,
        school: {
          select: {
            schoolId: true,
            schoolName: true,
            schoolCode: true
          }
        },
        _count: {
          select: {
            classTeachers: true,
            homeroomClasses: true
          }
        }
      }
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: teacher
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
};

module.exports = {
  // Admin functions
  createTeacher,
  getAllTeachers,
  getTeacherById,
  updateTeacher,
  deactivateTeacher,
  
  // Teacher self-service functions
  getMyClasses,
  getClassStudents,
  getMyProfile
};