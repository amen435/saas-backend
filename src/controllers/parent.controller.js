// src/controllers/parent.controller.js

const bcrypt = require('bcrypt');
const prisma = require('../config/database');

/**
 * @route   POST /api/homeroom/classes/:classId/parents
 * @desc    Create parent for student(s) in homeroom class
 * @access  HOMEROOM_TEACHER
 */
const createParent = async (req, res) => {
  try {
    const {
      userId,
      username,
      email,
      password,
      fullName,
      phone,
      studentIds, // Array of student IDs to link
      relationship,
      occupation,
      address
    } = req.body;

    const { schoolId } = req.user;
    const teacher = req.teacher; // From middleware
    const classData = req.class; // From middleware

    // ============================================
    // 1. VALIDATION
    // ============================================
    
    if (!userId || !username || !password || !fullName) {
      return res.status(400).json({
        success: false,
        error: 'userId, username, password, and fullName are required'
      });
    }

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one student ID is required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters'
      });
    }

    // ============================================
    // 2. VERIFY ALL STUDENTS BELONG TO HOMEROOM CLASS
    // ============================================
    
    const students = await prisma.student.findMany({
      where: {
        studentId: { in: studentIds.map(id => parseInt(id)) },
        schoolId,
        classId: classData.classId
      }
    });

    if (students.length !== studentIds.length) {
      return res.status(400).json({
        success: false,
        error: 'One or more students not found in your homeroom class'
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

    // ============================================
    // 4. HASH PASSWORD
    // ============================================
    
    const passwordHash = await bcrypt.hash(password, 10);

    // ============================================
    // 5. CREATE USER, PARENT, AND LINK TO STUDENTS
    // ============================================
    
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          userId,
          username,
          email: email || null,
          passwordHash,
          role: 'PARENT', // Automatically set
          schoolId,
          fullName,
          phone: phone || null,
          isActive: true,
          failedAttempts: 0
        }
      });

      // Create parent
      const parent = await tx.parent.create({
        data: {
          userId: user.userId,
          schoolId,
          relationship: relationship || null,
          occupation: occupation || null,
          address: address || null,
          isActive: true
        }
      });

      // Link parent to students
      const parentStudentLinks = await Promise.all(
        students.map((student, index) =>
          tx.parentStudent.create({
            data: {
              parentId: parent.parentId,
              studentId: student.studentId,
              relationship: relationship || 'Guardian',
              isPrimary: index === 0 // First student is primary
            }
          })
        )
      );

      // Return parent with linked students
      return await tx.parent.findUnique({
        where: { parentId: parent.parentId },
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
          children: {
            include: {
              student: {
                include: {
                  user: {
                    select: {
                      fullName: true
                    }
                  },
                  class: {
                    select: {
                      className: true,
                      gradeLevel: true
                    }
                  }
                }
              }
            }
          }
        }
      });
    });

    res.status(201).json({
      success: true,
      message: 'Parent created successfully',
      data: result
    });

  } catch (error) {
    console.error('Create parent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create parent'
    });
  }
};

/**
 * @route   GET /api/homeroom/classes/:classId/parents
 * @desc    Get all parents of students in homeroom class
 * @access  HOMEROOM_TEACHER
 */
const getClassParents = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const classData = req.class; // From middleware

    // Get all students in this class
    const students = await prisma.student.findMany({
      where: {
        classId: classData.classId,
        schoolId
      },
      select: {
        studentId: true
      }
    });

    const studentIds = students.map(s => s.studentId);

    // Get parents linked to these students
    const parentStudentLinks = await prisma.parentStudent.findMany({
      where: {
        studentId: { in: studentIds }
      },
      include: {
        parent: {
          include: {
            user: {
              select: {
                userId: true,
                username: true,
                email: true,
                fullName: true,
                phone: true,
                isActive: true
              }
            }
          }
        },
        student: {
          include: {
            user: {
              select: {
                fullName: true
              }
            }
          }
        }
      }
    });

    // Group by parent
    const parentsMap = new Map();

    parentStudentLinks.forEach(link => {
      const parentId = link.parent.parentId;
      
      if (!parentsMap.has(parentId)) {
        parentsMap.set(parentId, {
          ...link.parent,
          children: []
        });
      }

      parentsMap.get(parentId).children.push({
        studentId: link.student.studentId,
        studentName: link.student.user.fullName,
        relationship: link.relationship,
        isPrimary: link.isPrimary
      });
    });

    const parents = Array.from(parentsMap.values());

    res.status(200).json({
      success: true,
      count: parents.length,
      data: parents
    });

  } catch (error) {
    console.error('Get class parents error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch parents'
    });
  }
};

/**
 * @route   GET /api/homeroom/parents/:parentId
 * @desc    Get single parent details
 * @access  HOMEROOM_TEACHER
 */
const getParentById = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { schoolId } = req.user;
    const teacher = req.teacher;

    const parent = await prisma.parent.findFirst({
      where: {
        parentId: parseInt(parentId),
        schoolId
      },
      include: {
        user: true,
        school: {
          select: {
            schoolName: true,
            schoolCode: true
          }
        },
        children: {
          include: {
            student: {
              include: {
                user: {
                  select: {
                    fullName: true
                  }
                },
                class: {
                  select: {
                    className: true,
                    gradeLevel: true,
                    homeroomTeacherId: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!parent) {
      return res.status(404).json({
        success: false,
        error: 'Parent not found'
      });
    }

    // Verify at least one child is in homeroom teacher's class
    const hasChildInHomeroomClass = parent.children.some(
      child => child.student.class.homeroomTeacherId === teacher.teacherId
    );

    if (!hasChildInHomeroomClass) {
      return res.status(403).json({
        success: false,
        error: 'You can only view parents of students in your homeroom class'
      });
    }

    res.status(200).json({
      success: true,
      data: parent
    });

  } catch (error) {
    console.error('Get parent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch parent'
    });
  }
};

/**
 * @route   PUT /api/homeroom/parents/:parentId
 * @desc    Update parent basic info
 * @access  HOMEROOM_TEACHER
 */
const updateParent = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { schoolId } = req.user;
    const teacher = req.teacher;
    const {
      fullName,
      phone,
      email,
      relationship,
      occupation,
      address
    } = req.body;

    // Get parent
    const parent = await prisma.parent.findFirst({
      where: {
        parentId: parseInt(parentId),
        schoolId
      },
      include: {
        children: {
          include: {
            student: {
              include: {
                class: {
                  select: {
                    homeroomTeacherId: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!parent) {
      return res.status(404).json({
        success: false,
        error: 'Parent not found'
      });
    }

    // Verify at least one child is in homeroom teacher's class
    const hasChildInHomeroomClass = parent.children.some(
      child => child.student.class.homeroomTeacherId === teacher.teacherId
    );

    if (!hasChildInHomeroomClass) {
      return res.status(403).json({
        success: false,
        error: 'You can only update parents of students in your homeroom class'
      });
    }

    // Update in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update user
      if (fullName || phone || email !== undefined) {
        await tx.user.update({
          where: { userId: parent.userId },
          data: {
            fullName: fullName || undefined,
            phone: phone || undefined,
            email: email || undefined
          }
        });
      }

      // Update parent
      const updatedParent = await tx.parent.update({
        where: { parentId: parseInt(parentId) },
        data: {
          relationship: relationship || undefined,
          occupation: occupation || undefined,
          address: address || undefined
        },
        include: {
          user: true,
          children: {
            include: {
              student: {
                include: {
                  user: {
                    select: {
                      fullName: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      return updatedParent;
    });

    res.status(200).json({
      success: true,
      message: 'Parent updated successfully',
      data: result
    });

  } catch (error) {
    console.error('Update parent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update parent'
    });
  }
};

/**
 * @route   POST /api/homeroom/parents/:parentId/add-child
 * @desc    Link another student to parent
 * @access  HOMEROOM_TEACHER
 */
const addChildToParent = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { studentId, relationship, isPrimary } = req.body;
    const { schoolId } = req.user;
    const teacher = req.teacher;
    const classData = req.class;

    if (!studentId) {
      return res.status(400).json({
        success: false,
        error: 'studentId is required'
      });
    }

    // Verify parent exists
    const parent = await prisma.parent.findFirst({
      where: {
        parentId: parseInt(parentId),
        schoolId
      }
    });

    if (!parent) {
      return res.status(404).json({
        success: false,
        error: 'Parent not found'
      });
    }

    // Verify student exists and is in homeroom class
    const student = await prisma.student.findFirst({
      where: {
        studentId: parseInt(studentId),
        schoolId,
        classId: classData.classId
      }
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found in your homeroom class'
      });
    }

    // Check if link already exists
    const existingLink = await prisma.parentStudent.findFirst({
      where: {
        parentId: parseInt(parentId),
        studentId: parseInt(studentId)
      }
    });

    if (existingLink) {
      return res.status(409).json({
        success: false,
        error: 'Parent is already linked to this student'
      });
    }

    // Create link
    const link = await prisma.parentStudent.create({
      data: {
        parentId: parseInt(parentId),
        studentId: parseInt(studentId),
        relationship: relationship || 'Guardian',
        isPrimary: isPrimary || false
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                fullName: true
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Child added to parent successfully',
      data: link
    });

  } catch (error) {
    console.error('Add child to parent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add child to parent'
    });
  }
};

/**
 * @route   DELETE /api/homeroom/parents/:parentId/children/:studentId
 * @desc    Remove student from parent
 * @access  HOMEROOM_TEACHER
 */
const removeChildFromParent = async (req, res) => {
  try {
    const { parentId, studentId } = req.params;
    const { schoolId } = req.user;
    const teacher = req.teacher;

    // Verify parent exists
    const parent = await prisma.parent.findFirst({
      where: {
        parentId: parseInt(parentId),
        schoolId
      }
    });

    if (!parent) {
      return res.status(404).json({
        success: false,
        error: 'Parent not found'
      });
    }

    // Verify student exists and is in homeroom class
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

    // Verify teacher is homeroom of student's class
    if (student.class.homeroomTeacherId !== teacher.teacherId) {
      return res.status(403).json({
        success: false,
        error: 'You can only manage parents of students in your homeroom class'
      });
    }

    // Remove link
    await prisma.parentStudent.deleteMany({
      where: {
        parentId: parseInt(parentId),
        studentId: parseInt(studentId)
      }
    });

    res.status(200).json({
      success: true,
      message: 'Child removed from parent successfully'
    });

  } catch (error) {
    console.error('Remove child from parent error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove child from parent'
    });
  }
};

/**
 * @route   GET /api/parents/me/children
 * @desc    Get all students linked to the logged-in parent
 * @access  PARENT
 */
const getMyChildren = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;

    console.log("[getMyChildren] request:", { userId, schoolId });

    const parent = await prisma.parent.findFirst({
      where: { userId, schoolId },
      select: { parentId: true },
    });

    if (!parent) {
      return res.status(404).json({
        success: false,
        error: 'Parent record not found',
      });
    }

    const links = await prisma.parentStudent.findMany({
      where: { parentId: parent.parentId },
      include: {
        student: {
          include: {
            user: {
              select: {
                fullName: true,
              },
            },
            class: {
              select: {
                classId: true,
                className: true,
                gradeLevel: true,
                section: true,
                academicYear: true,
              },
            },
          },
        },
      },
    });

    const children = links
      .map((l) => {
        const s = l.student;
        const cls = s?.class;
        if (!s || !cls) return null;
        return {
          id: s.studentId,
          name: s.user?.fullName ?? `Student #${s.studentId}`,
          avatar: (s.user?.fullName ?? '').charAt(0) || 'S',
          grade: cls.gradeLevel,
          section: cls.section ?? '',
          classId: cls.classId,
          academicYear: cls.academicYear,
          className: cls.className,
        };
      })
      .filter(Boolean);

    console.log("[getMyChildren] response:", { childrenCount: children.length });

    return res.status(200).json({
      success: true,
      data: children,
    });
  } catch (error) {
    console.error('Get parent children error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch parent children',
    });
  }
};

module.exports = {
  createParent,
  getClassParents,
  getParentById,
  updateParent,
  addChildToParent,
  removeChildFromParent,
  getMyChildren,
};