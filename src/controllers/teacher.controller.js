// src/controllers/teacher.controller.js

const bcrypt = require('bcrypt');
const prisma = require('../config/database');

/**
 * @route   POST /api/admin/teachers
 * @desc    Create a new teacher (School Admin)
 * @access  SCHOOL_ADMIN
 */
const createTeacher = async (req, res) => {
  try {
    const {
      userId,
      username,
      email,
      password,
      fullName,
      phone,
      role,
      specialization
    } = req.body;

    const { schoolId } = req.user;

    if (!userId || !username || !password || !fullName) {
      return res.status(400).json({
        success: false,
        error: 'userId, username, password, and fullName are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    const teacherRole = role || 'TEACHER';
    if (!['TEACHER', 'HOMEROOM_TEACHER'].includes(teacherRole)) {
      return res.status(400).json({
        success: false,
        error: 'Role must be TEACHER or HOMEROOM_TEACHER'
      });
    }

    const existingUserId = await prisma.user.findUnique({
      where: { userId }
    });
    if (existingUserId) {
      return res.status(409).json({
        success: false,
        error: 'User ID already exists'
      });
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username }
    });
    if (existingUsername) {
      return res.status(409).json({
        success: false,
        error: 'Username already exists'
      });
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email }
      });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Email already exists'
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          userId,
          username,
          email: email || null,
          passwordHash,
          role: teacherRole,
          schoolId,
          fullName,
          phone: phone || null,
          isActive: true,
          failedAttempts: 0
        }
      });

      const teacher = await tx.teacher.create({
        data: {
          userId: user.userId,
          schoolId,
          specialization: specialization || null,
          isActive: true
        },
        include: {
          user: {
            select: {
              userId: true,
              username: true,
              email: true,
              fullName: true,
              phone: true,
              role: true,
              isActive: true
            }
          },
          school: {
            select: {
              schoolId: true,
              schoolName: true,
              schoolCode: true
            }
          }
        }
      });

      return teacher;
    });

    res.status(201).json({
      success: true,
      message: 'Teacher created successfully',
      data: result
    });
  } catch (error) {
    console.error('Create teacher error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create teacher'
    });
  }
};

/**
 * @route   GET /api/admin/teachers
 * @desc    Get all teachers for school admin's school
 * @access  SCHOOL_ADMIN
 */
const getAllTeachers = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { isActive, role, search } = req.query;

    const where = {
      schoolId
    };

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (role && ['TEACHER', 'HOMEROOM_TEACHER'].includes(role)) {
      where.user = {
        role
      };
    }

    if (search) {
      where.OR = [
        {
          user: {
            fullName: { contains: search }
          }
        },
        {
          user: {
            username: { contains: search }
          }
        },
        {
          specialization: { contains: search }
        }
      ];
    }

    const teachers = await prisma.teacher.findMany({
      where,
      include: {
        user: {
          select: {
            userId: true,
            username: true,
            email: true,
            fullName: true,
            phone: true,
            role: true,
            isActive: true,
            lastLogin: true
          }
        },
        _count: {
          select: {
            classTeachers: true,
            homeroomClasses: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers
    });
  } catch (error) {
    console.error('Get all teachers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teachers'
    });
  }
};

/**
 * @route   GET /api/admin/teachers/:teacherId
 * @desc    Get single teacher
 * @access  SCHOOL_ADMIN
 */
const getTeacherById = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { schoolId } = req.user;

    const teacher = await prisma.teacher.findFirst({
      where: {
        teacherId: parseInt(teacherId),
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
        classTeachers: {
          include: {
            class: {
              select: {
                classId: true,
                className: true,
                gradeLevel: true,
                section: true,
                academicYear: true
              }
            }
          }
        },
        homeroomClasses: {
          select: {
            classId: true,
            className: true,
            gradeLevel: true,
            section: true,
            academicYear: true
          }
        }
      }
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    res.status(200).json({
      success: true,
      data: teacher
    });
  } catch (error) {
    console.error('Get teacher by id error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teacher'
    });
  }
};

/**
 * @route   PUT /api/admin/teachers/:teacherId
 * @desc    Update teacher
 * @access  SCHOOL_ADMIN
 */
const updateTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { schoolId } = req.user;
    const { fullName, phone, email, specialization, role } = req.body;

    const teacher = await prisma.teacher.findFirst({
      where: {
        teacherId: parseInt(teacherId),
        schoolId
      }
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    if (role && !['TEACHER', 'HOMEROOM_TEACHER'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Role must be TEACHER or HOMEROOM_TEACHER'
      });
    }

    if (email) {
      const existingEmail = await prisma.user.findFirst({
        where: {
          email,
          userId: {
            not: teacher.userId
          }
        }
      });
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Email already exists'
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId: teacher.userId },
        data: {
          fullName: fullName || undefined,
          phone: phone || undefined,
          email: email || undefined,
          role: role || undefined
        }
      });

      const updatedTeacher = await tx.teacher.update({
        where: { teacherId: parseInt(teacherId) },
        data: {
          specialization: specialization || undefined
        },
        include: {
          user: {
            select: {
              userId: true,
              username: true,
              email: true,
              fullName: true,
              phone: true,
              role: true,
              isActive: true
            }
          },
          school: {
            select: {
              schoolId: true,
              schoolName: true,
              schoolCode: true
            }
          }
        }
      });

      return updatedTeacher;
    });

    res.status(200).json({
      success: true,
      message: 'Teacher updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Update teacher error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update teacher'
    });
  }
};

/**
 * @route   PATCH /api/admin/teachers/:teacherId/deactivate
 * @desc    Deactivate teacher
 * @access  SCHOOL_ADMIN
 */
const deactivateTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { schoolId } = req.user;

    const teacher = await prisma.teacher.findFirst({
      where: {
        teacherId: parseInt(teacherId),
        schoolId
      }
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found'
      });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { userId: teacher.userId },
        data: { isActive: false }
      }),
      prisma.teacher.update({
        where: { teacherId: parseInt(teacherId) },
        data: { isActive: false }
      })
    ]);

    res.status(200).json({
      success: true,
      message: 'Teacher deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate teacher error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate teacher'
    });
  }
};

/**
 * @route   GET /api/teacher/my-classes
 * @desc    Get classes the teacher is assigned to
 * @access  TEACHER
 */
const getMyClasses = async (req, res) => {
  try {
    const { schoolId, userId: teacherUserId } = req.user;

    // Get teacher record
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

    // Get classes where teacher is assigned via classTeacher (subject-specific)
    const classAssignments = await prisma.classTeacher.findMany({
      where: {
        teacherId: teacher.teacherId,
        class: { schoolId },
      },
      include: {
        class: {
          include: {
            homeroomTeacher: {
              include: {
                user: {
                  select: {
                    fullName: true,
                  },
                },
              },
            },
            _count: {
              select: {
                students: true,
              },
            },
          },
        },
      },
    });

    const taughtClasses = classAssignments.map((ca) => ({
      ...ca.class,
      subjectTaught: ca.subjectName,
      isHomeroom: ca.class.homeroomTeacherId === teacher.teacherId,
    }));

    // ALSO include homeroom classes even if not assigned via classTeacher
    const homeroomClasses = await prisma.class.findMany({
      where: {
        schoolId,
        homeroomTeacherId: teacher.teacherId,
        isActive: true,
      },
      include: {
        homeroomTeacher: {
          include: {
            user: {
              select: {
                fullName: true,
              },
            },
          },
        },
        _count: {
          select: {
            students: true,
          },
        },
      },
      orderBy: [{ gradeLevel: 'asc' }, { section: 'asc' }],
    });

    // Merge + de-duplicate by classId (if teacher both teaches and is homeroom)
    const merged = new Map();
    for (const c of taughtClasses) merged.set(c.classId, c);
    for (const c of homeroomClasses) {
      if (!merged.has(c.classId)) {
        merged.set(c.classId, {
          ...c,
          subjectTaught: null,
          isHomeroom: true,
        });
      }
    }

    const classes = Array.from(merged.values());

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

/**
 * @route   GET /api/teacher/classes/:classId/students
 * @desc    Get students in a class teacher teaches
 * @access  TEACHER
 */
const getClassStudents = async (req, res) => {
  try {
    const { classId } = req.params;
    const { schoolId, userId: teacherUserId } = req.user;

    // Get teacher record
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

    // Verify teacher has access: teaches via classTeacher OR is homeroom teacher
    const classRow = await prisma.class.findFirst({
      where: { classId: parseInt(classId), schoolId },
      select: { classId: true, homeroomTeacherId: true },
    });

    if (!classRow) {
      return res.status(404).json({
        success: false,
        error: 'Class not found',
      });
    }

    const teachesClass = await prisma.classTeacher.findFirst({
      where: {
        teacherId: teacher.teacherId,
        classId: parseInt(classId),
      },
      select: { id: true },
    });

    const isHomeroom = classRow.homeroomTeacherId === teacher.teacherId;

    if (!teachesClass && !isHomeroom) {
      return res.status(403).json({
        success: false,
        error: 'You do not teach this class',
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
            fullName: true,
          }
        }
      },
      // NOTE: ordering by nested relation fields can break on some Prisma/MySQL setups.
      // Keep a stable order here; UI can sort if needed.
      orderBy: { studentId: 'asc' }
    });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students
    });

  } catch (error) {
    console.error('Get class students error:', { error, classId: req.params.classId, schoolId: req.user?.schoolId, userId: req.user?.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students',
      details: error?.message
    });
  }
};

/**
 * @route   GET /api/teacher/profile
 * @desc    Get teacher's own profile
 * @access  TEACHER
 */
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

/**
 * @route   GET /api/teacher/my-attendance
 * @desc    Get teacher attendance history (self)
 * @access  TEACHER
 * Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
const getMyAttendance = async (req, res) => {
  try {
    const { schoolId, userId: teacherUserId } = req.user;
    const { startDate, endDate } = req.query;

    const teacher = await prisma.teacher.findFirst({
      where: { userId: teacherUserId, schoolId },
      select: { teacherId: true },
    });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher record not found' });
    }

    const where = {
      schoolId,
      teacherId: teacher.teacherId,
    };

    if (startDate || endDate) {
      where.attendanceDate = {};
      if (startDate) where.attendanceDate.gte = new Date(startDate);
      if (endDate) where.attendanceDate.lte = new Date(endDate);
    }

    const records = await prisma.teacherAttendance.findMany({
      where,
      orderBy: { attendanceDate: 'desc' },
    });

    return res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    console.error('Get my teacher attendance error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch attendance history' });
  }
};

module.exports = {
  createTeacher,
  getAllTeachers,
  getTeacherById,
  updateTeacher,
  deactivateTeacher,
  getMyClasses,
  getClassStudents,
  getMyProfile,
  getMyAttendance
};
