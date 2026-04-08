// src/controllers/homeroom.controller.js

const bcrypt = require('bcrypt');
const prisma = require('../config/database');
const { validatePasswordStrength } = require('../utils/password.utils');

/**
 * @route   GET /api/homeroom/my-homeroom-classes
 * @desc    Get classes where teacher is homeroom teacher
 * @access  TEACHER (who is homeroom)
 */
const getMyHomeroomClasses = async (req, res) => {
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

    // Get homeroom classes
    const homeroomClasses = await prisma.class.findMany({
      where: {
        homeroomTeacherId: teacher.teacherId,
        schoolId,
        isActive: true
      },
      include: {
        _count: {
          select: {
            students: true,
            classTeachers: true
          }
        }
      },
      orderBy: {
        gradeLevel: 'asc'
      }
    });

    res.status(200).json({
      success: true,
      count: homeroomClasses.length,
      data: homeroomClasses
    });

  } catch (error) {
    console.error('Get homeroom classes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch homeroom classes'
    });
  }
};

/**
 * @route   POST /api/homeroom/classes/:classId/students
 * @desc    Create student in homeroom class
 * @access  HOMEROOM_TEACHER
 */
const createStudent = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const teacher = req.teacher; // From middleware
    const classData = req.class; // From middleware

    // New contract: frontend sends both records together:
    //   req.body = { student: {...}, parent: {...} }
    // Backward-compatible fallback:
    //   req.body may contain student fields at top-level + guardianName/guardianPhone.
    const studentPayload = req.body.student || req.body;
    const parentPayload = req.body.parent || null;
    const parentFromPayload = !!parentPayload;

    const {
      userId,
      username,
      email,
      password,
      fullName,
      phone,
      studentCode,
      dateOfBirth,
      gender,
      guardianName,
      guardianPhone,
      address
    } = studentPayload;

    const effectiveParent = parentPayload || (guardianName || guardianPhone ? {
      fullName: guardianName,
      phoneNumber: guardianPhone,
    } : null);

    // Validation
    const effectiveClassId = studentPayload.classId ?? classData.classId;
    if (!userId || !username || !password || !fullName || !effectiveClassId) {
      return res.status(400).json({
        success: false,
        error: 'userId, username, password, fullName, and classId are required'
      });
    }

    // If frontend provided classId in the body, ensure it matches the URL class.
    if (
      studentPayload.classId !== undefined &&
      parseInt(studentPayload.classId) !== parseInt(classData.classId)
    ) {
      return res.status(403).json({
        success: false,
        error: 'classId mismatch for this homeroom class'
      });
    }

    const studentPasswordError = validatePasswordStrength(password);
    if (studentPasswordError) {
      return res.status(400).json({
        success: false,
        error: studentPasswordError
      });
    }

    if (
      !effectiveParent ||
      !effectiveParent.fullName ||
      !effectiveParent.phoneNumber
    ) {
      return res.status(400).json({
        success: false,
        error: 'parent.fullName and parent.phoneNumber are required'
      });
    }

    if (parentFromPayload) {
      const parentPassword = String(effectiveParent.password || '').trim();
      if (!parentPassword) {
        return res.status(400).json({
          success: false,
          error: 'parent.password is required'
        });
      }
      const parentPasswordError = validatePasswordStrength(parentPassword);
      if (parentPasswordError) {
        return res.status(400).json({
          success: false,
          error: parentPasswordError
        });
      }
    }

    const normalizedParentPhone = String(effectiveParent.phoneNumber).trim();
    if (!normalizedParentPhone) {
      return res.status(400).json({
        success: false,
        error: 'parent.phoneNumber is required'
      });
    }

    let parentCreated = false;
    let createdOrReusedParent = null;
    let linkingResult = null;

    // Check duplicates (student account)
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

    // Create parent (if needed) + create student + link (atomic).
    const result = await prisma.$transaction(async (tx) => {
      const parentRelationship = effectiveParent.relationship || 'Guardian';
      const parentOccupation = effectiveParent.occupation || null;
      const parentAddress = effectiveParent.address || null;
      const parentPasswordFromRequest = parentFromPayload
        ? String(effectiveParent.password || '').trim()
        : null;

      // =========================
      // 1) Find or create parent
      // =========================
      // Preferred: reuse by Parent.phoneNumber (new schema).
      // Fallback: reuse by User.phone to handle older parents created
      // before Parent.phoneNumber existed.
      let parentRecord = null;
      if (normalizedParentPhone) {
        parentRecord = await tx.parent.findFirst({
          where: {
            phoneNumber: normalizedParentPhone,
            schoolId,
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
            }
          }
        });

        if (!parentRecord) {
          const existingParentUser = await tx.user.findFirst({
            where: {
              phone: normalizedParentPhone,
              role: 'PARENT',
              isActive: true,
            },
            select: { userId: true },
          });

          if (existingParentUser) {
            parentRecord = await tx.parent.findFirst({
              where: { userId: existingParentUser.userId, schoolId },
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
                }
              }
            });
          }
        }
      }

      if (!parentRecord) {
        parentCreated = true;

        const normalizedParentFullName = String(effectiveParent.fullName).trim();
        const parentUserId =
          String(effectiveParent.userId || effectiveParent.parentId || `PAR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
            .trim();

        const phoneDigits = normalizedParentPhone.replace(/\D/g, '');
        const derivedUsername = `parent.${phoneDigits.slice(-10) || parentUserId}`.toLowerCase();
        const parentUsername = String(effectiveParent.username || derivedUsername).trim();

        // Backend uses parent password from request (needed for parent login).
        // Fallback to temp password only for older callers that didn't send a password.
        const tempPassword =
          parentPasswordFromRequest ||
          `Temp!${Date.now()}${Math.random().toString(36).slice(2, 8)}A1`;

        const parentPasswordHash = await bcrypt.hash(tempPassword, 10);

        try {
          const parentUser = await tx.user.create({
            data: {
              userId: parentUserId,
              username: parentUsername,
              email: effectiveParent.email ? String(effectiveParent.email) : null,
              passwordHash: parentPasswordHash,
              role: 'PARENT',
              schoolId,
              fullName: normalizedParentFullName,
              phone: normalizedParentPhone || null,
              isActive: true,
              failedAttempts: 0,
            }
          });

          parentRecord = await tx.parent.create({
            data: {
              userId: parentUser.userId,
              schoolId,
              relationship: effectiveParent.relationship || null,
              occupation: parentOccupation,
              address: parentAddress,
              phoneNumber: normalizedParentPhone || null,
              isActive: true,
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
              }
            }
          });
        } catch (error) {
          // If two requests race to create the same parent account,
          // unique constraints may trigger. Re-fetch and reuse the existing parent.
          if (error?.code === 'P2002') {
            parentCreated = false;
            parentRecord = await tx.parent.findFirst({
              where: { phoneNumber: normalizedParentPhone, schoolId },
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
                }
              }
            });

            if (!parentRecord) {
              const existingParentUser = await tx.user.findFirst({
                where: {
                  phone: normalizedParentPhone,
                  role: 'PARENT',
                  isActive: true,
                },
                select: { userId: true },
              });

              if (existingParentUser) {
                parentRecord = await tx.parent.findFirst({
                  where: { userId: existingParentUser.userId, schoolId },
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
                    }
                  }
                });
              }
            }

            if (!parentRecord) throw error;
          } else {
            throw error;
          }
        }
      }

      // If parent was reused and a password was provided, keep it up-to-date for login.
      if (parentRecord && parentPasswordFromRequest) {
        await tx.user.update({
          where: { userId: parentRecord.userId },
          data: {
            passwordHash: await bcrypt.hash(parentPasswordFromRequest, 10),
          },
        });
      }

      // =========================
      // 2) Create student
      // =========================
      const studentPasswordHash = await bcrypt.hash(password, 10);

      const studentUser = await tx.user.create({
        data: {
          userId,
          username,
          email: email || null,
          passwordHash: studentPasswordHash,
          role: 'STUDENT',
          schoolId,
          fullName,
          phone: phone || null,
          isActive: true,
          failedAttempts: 0,
        }
      });

      const student = await tx.student.create({
        data: {
          userId: studentUser.userId,
          schoolId,
          classId: classData.classId,
          studentCode: studentCode || null,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender: gender || null,
          guardianName: guardianName || effectiveParent.fullName || null,
          guardianPhone: guardianPhone || normalizedParentPhone || null,
          address: address || null,
          isActive: true
        },
        include: {
          user: {
            select: {
              userId: true,
              username: true,
              fullName: true,
              email: true,
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
          }
        }
      });

      // =========================
      // 3) Link Parent ↔ Student
      // =========================
      const existingLink = await tx.parentStudent.findFirst({
        where: {
          parentId: parentRecord.parentId,
          studentId: student.studentId,
        },
      });

      if (existingLink) {
        linkingResult = existingLink;
      } else {
        linkingResult = await tx.parentStudent.create({
          data: {
            parentId: parentRecord.parentId,
            studentId: student.studentId,
            relationship: parentRelationship,
            isPrimary: false
          }
        });
      }

      createdOrReusedParent = parentRecord;
      return { student, parent: parentRecord };
    });

    res.status(201).json({
      success: true,
      message: 'Student created successfully',
      data: {
        student: result.student,
        parent: createdOrReusedParent,
        parentCreated,
        link: linkingResult,
      }
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
 * @route   GET /api/homeroom/classes/:classId/students
 * @desc    Get students in homeroom class
 * @access  HOMEROOM_TEACHER
 */
const getHomeroomStudents = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const classData = req.class; // From middleware
    const { isActive } = req.query;

    const where = {
      classId: classData.classId,
      schoolId
    };

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

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
    console.error('Get homeroom students error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students'
    });
  }
};

/**
 * @route   GET /api/homeroom/students/:studentId
 * @desc    Get single student details
 * @access  HOMEROOM_TEACHER
 */
const getStudentById = async (req, res) => {
  try {
    const student = req.student; // From middleware (already verified)

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
 * @route   PUT /api/homeroom/students/:studentId
 * @desc    Update student basic info
 * @access  HOMEROOM_TEACHER
 */
const updateStudent = async (req, res) => {
  try {
    const student = req.student; // From middleware
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
        where: { studentId: student.studentId },
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
 * @route   PATCH /api/homeroom/students/:studentId/deactivate
 * @desc    Deactivate student
 * @access  HOMEROOM_TEACHER
 */
const deactivateStudent = async (req, res) => {
  try {
    const student = req.student; // From middleware

    await prisma.$transaction([
      prisma.user.update({
        where: { userId: student.userId },
        data: { isActive: false }
      }),
      prisma.student.update({
        where: { studentId: student.studentId },
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

/**
 * @route   PATCH /api/homeroom/students/:studentId/activate
 * @desc    Activate student account
 * @access  HOMEROOM_TEACHER
 */
const activateStudent = async (req, res) => {
  try {
    const student = req.student; // From middleware

    await prisma.$transaction([
      prisma.user.update({
        where: { userId: student.userId },
        data: { isActive: true }
      }),
      prisma.student.update({
        where: { studentId: student.studentId },
        data: { isActive: true }
      })
    ]);

    res.status(200).json({
      success: true,
      message: 'Student activated successfully'
    });
  } catch (error) {
    console.error('Activate student error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate student'
    });
  }
};

/**
 * @route   DELETE /api/homeroom/students/:studentId
 * @desc    Permanently delete student account (hard delete)
 * @access  HOMEROOM_TEACHER
 */
const deleteStudent = async (req, res) => {
  try {
    const student = req.student; // From middleware

    // Student's User has onDelete: Cascade in Prisma schema.
    // Deleting the user will cascade to student + dependent records.
    await prisma.user.delete({
      where: { userId: student.userId }
    });

    res.status(200).json({
      success: true,
      message: 'Student deleted successfully'
    });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete student'
    });
  }
};

module.exports = {
  getMyHomeroomClasses,
  createStudent,
  getHomeroomStudents,
  getStudentById,
  updateStudent,
  deactivateStudent,
  activateStudent,
  deleteStudent
};
