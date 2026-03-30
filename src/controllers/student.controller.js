// src/controllers/student.controller.js

const bcrypt = require('bcrypt');
const prisma = require('../config/database');

/**
 * @route   POST /api/students
 * @desc    Create a new student (Homeroom teacher only)
 * @access  HOMEROOM_TEACHER / TEACHER (who is homeroom)
 */
const createStudent = async (req, res) => {
  try {
    const {
      userId,
      username,
      email,
      password,
      fullName,
      phone,
      classId,
      studentCode,
      dateOfBirth,
      gender,
      guardianName,
      guardianPhone,
      address
    } = req.body;

    const { schoolId, userId: teacherUserId } = req.user; // From JWT

    // ============================================
    // 1. VALIDATION
    // ============================================
    
    if (!userId || !username || !password || !fullName || !classId) {
      return res.status(400).json({
        success: false,
        error: 'userId, username, password, fullName, and classId are required'
      });
    }

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // ============================================
    // 2. VERIFY TEACHER IS HOMEROOM OF THIS CLASS
    // ============================================
    
    // Get teacher record
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherUserId,
        schoolId
      }
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Teacher record not found'
      });
    }

    // Verify class exists and belongs to teacher's school
    const classData = await prisma.class.findFirst({
      where: {
        classId: parseInt(classId),
        schoolId
      }
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found or does not belong to your school'
      });
    }

    // Check if teacher is homeroom teacher of this class
    if (classData.homeroomTeacherId !== teacher.teacherId) {
      return res.status(403).json({
        success: false,
        error: 'Only the homeroom teacher of this class can create students'
      });
    }

    // ============================================
    // 3. CHECK DUPLICATES
    // ============================================
    
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

    if (studentCode) {
      const existingCode = await prisma.student.findUnique({
        where: { studentCode }
      });

      if (existingCode) {
        return res.status(409).json({
          success: false,
          error: 'Student code already exists'
        });
      }
    }

    // ============================================
    // 4. HASH PASSWORD
    // ============================================
    
    const passwordHash = await bcrypt.hash(password, 10);

    // ============================================
    // 5. CREATE USER AND STUDENT IN TRANSACTION
    // ============================================
    
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          userId,
          username,
          email: email || null,
          passwordHash,
          role: 'STUDENT', // Automatically set
          schoolId,
          fullName,
          phone: phone || null,
          isActive: true,
          failedAttempts: 0
        }
      });

      // Create student
      const student = await tx.student.create({
        data: {
          userId: user.userId,
          schoolId,
          classId: parseInt(classId),
          studentCode: studentCode || null,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender: gender || null,
          guardianName: guardianName || null,
          guardianPhone: guardianPhone || null,
          address: address || null,
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
              role: true
            }
          },
          class: {
            select: {
              classId: true,
              className: true,
              gradeLevel: true,
              section: true
            }
          },
          school: {
            select: {
              schoolId: true,
              schoolName: true
            }
          }
        }
      });

      return student;
    });

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: result
    });

  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create student'
    });
  }
};

/**
 * @route   GET /api/students
 * @desc    Get all students for teacher's homeroom class(es)
 * @access  HOMEROOM_TEACHER
 */
const getMyClassStudents = async (req, res) => {
  try {
    const { schoolId, userId: teacherUserId } = req.user;
    const { classId, isActive } = req.query;

    // Get teacher record
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherUserId,
        schoolId
      }
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Teacher record not found'
      });
    }

    // Build where clause
    const where = {
      schoolId
    };

    // If classId provided, verify teacher is homeroom
    if (classId) {
      const classData = await prisma.class.findFirst({
        where: {
          classId: parseInt(classId),
          schoolId,
          homeroomTeacherId: teacher.teacherId
        }
      });

      if (!classData) {
        return res.status(403).json({
          success: false,
          error: 'You are not the homeroom teacher of this class'
        });
      }

      where.classId = parseInt(classId);
    } else {
      // Get all classes where teacher is homeroom
      const homeroomClasses = await prisma.class.findMany({
        where: {
          schoolId,
          homeroomTeacherId: teacher.teacherId
        },
        select: {
          classId: true
        }
      });

      if (homeroomClasses.length === 0) {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          message: 'You are not a homeroom teacher of any class'
        });
      }

      where.classId = {
        in: homeroomClasses.map(c => c.classId)
      };
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    // Get students
    const students = await prisma.student.findMany({
      where,
      include: {
        user: {
          select: {
            userId: true,
            username: true,
            email: true,
            fullName: true,
            phone: true,
            isActive: true,
            lastLogin: true
          }
        },
        class: {
          select: {
            classId: true,
            className: true,
            gradeLevel: true,
            section: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students
    });

  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students'
    });
  }
};

/**
 * @route   GET /api/students/:studentId
 * @desc    Get single student
 * @access  HOMEROOM_TEACHER (of student's class)
 */
const getStudentById = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId, userId: teacherUserId } = req.user;

    // Get teacher record
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherUserId,
        schoolId
      }
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Teacher record not found'
      });
    }

    // Get student
    const student = await prisma.student.findFirst({
      where: {
        studentId: parseInt(studentId),
        schoolId
      },
      include: {
        user: true,
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
            }
          }
        },
        school: true
      }
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Verify teacher is homeroom of student's class
    if (student.class.homeroomTeacherId !== teacher.teacherId) {
      return res.status(403).json({
        success: false,
        error: 'You are not the homeroom teacher of this student\'s class'
      });
    }

    res.status(200).json({
      success: true,
      data: student
    });

  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch student'
    });
  }
};

/**
 * @route   PUT /api/students/:studentId
 * @desc    Update student
 * @access  HOMEROOM_TEACHER (of student's class)
 */
const updateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId, userId: teacherUserId } = req.user;
    const {
      fullName,
      phone,
      email,
      studentCode,
      dateOfBirth,
      gender,
      guardianName,
      guardianPhone,
      address
    } = req.body;

    // Get teacher record
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherUserId,
        schoolId
      }
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Teacher record not found'
      });
    }

    // Get student
    const student = await prisma.student.findFirst({
      where: {
        studentId: parseInt(studentId),
        schoolId
      },
      include: {
        class: true
      }
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Verify teacher is homeroom
    if (student.class.homeroomTeacherId !== teacher.teacherId) {
      return res.status(403).json({
        success: false,
        error: 'You are not the homeroom teacher of this student\'s class'
      });
    }

    // Update in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update user
      if (fullName || phone || email !== undefined) {
        await tx.user.update({
          where: { userId: student.userId },
          data: {
            fullName: fullName || undefined,
            phone: phone || undefined,
            email: email || undefined
          }
        });
      }

      // Update student
      const updatedStudent = await tx.student.update({
        where: { studentId: parseInt(studentId) },
        data: {
          studentCode: studentCode || undefined,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          gender: gender || undefined,
          guardianName: guardianName || undefined,
          guardianPhone: guardianPhone || undefined,
          address: address || undefined
        },
        include: {
          user: true,
          class: true
        }
      });

      return updatedStudent;
    });

    res.status(200).json({
      success: true,
      message: 'Student updated successfully',
      data: result
    });

  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update student'
    });
  }
};

/**
 * @route   PATCH /api/students/:studentId/deactivate
 * @desc    Deactivate student
 * @access  HOMEROOM_TEACHER
 */
const deactivateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId, userId: teacherUserId } = req.user;

    // Get teacher record
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId: teacherUserId,
        schoolId
      }
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        error: 'Teacher record not found'
      });
    }

    // Get student
    const student = await prisma.student.findFirst({
      where: {
        studentId: parseInt(studentId),
        schoolId
      },
      include: {
        class: true
      }
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Verify teacher is homeroom
    if (student.class.homeroomTeacherId !== teacher.teacherId) {
      return res.status(403).json({
        success: false,
        error: 'You are not the homeroom teacher of this student\'s class'
      });
    }

    // Deactivate both user and student
    await prisma.$transaction([
      prisma.user.update({
        where: { userId: student.userId },
        data: { isActive: false }
      }),
      prisma.student.update({
        where: { studentId: parseInt(studentId) },
        data: { isActive: false }
      })
    ]);

    res.status(200).json({
      success: true,
      message: 'Student deactivated successfully'
    });

  } catch (error) {
    console.error('Deactivate student error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate student'
    });
  }
};

module.exports = {
  createStudent,
  getMyClassStudents,
  getStudentById,
  updateStudent,
  deactivateStudent
};