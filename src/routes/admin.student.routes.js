// src/routes/admin.student.routes.js
// School Admin - get all students in the school

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const prisma = require('../config/database');
const { authenticateToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');

router.use(authenticateToken);
router.use(requireAdmin);

/**
 * @route   POST /api/admin/students
 * @desc    Create a student in school admin scope
 * @access  SCHOOL_ADMIN
 */
router.post('/', async (req, res) => {
  try {
    const { schoolId } = req.user;

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
      classId,
      studentCode,
      dateOfBirth,
      gender,
      guardianName,
      guardianPhone,
      address,
    } = studentPayload;

    const effectiveParent = parentPayload || (guardianName || guardianPhone ? {
      fullName: guardianName,
      phoneNumber: guardianPhone,
    } : null);

    if (!userId || !username || !password || !fullName || !classId) {
      return res.status(400).json({
        success: false,
        error: 'userId, username, password, fullName, and classId are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters',
      });
    }

    if (!effectiveParent || !effectiveParent.fullName || !effectiveParent.phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'parent.fullName and parent.phoneNumber are required',
      });
    }

    if (parentFromPayload) {
      const parentPassword = String(effectiveParent.password || '').trim();
      if (!parentPassword) {
        return res.status(400).json({
          success: false,
          error: 'parent.password is required',
        });
      }
      if (parentPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'parent.password must be at least 8 characters',
        });
      }
    }

    const normalizedClassId = parseInt(classId, 10);
    const classData = await prisma.class.findFirst({
      where: {
        classId: normalizedClassId,
        schoolId,
        isActive: true,
      },
    });

    if (!classData) {
      return res.status(404).json({
        success: false,
        error: 'Class not found or does not belong to your school',
      });
    }

    const existingUserId = await prisma.user.findUnique({ where: { userId } });
    if (existingUserId) {
      return res.status(409).json({ success: false, error: 'User ID already exists' });
    }

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }

    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        return res.status(409).json({ success: false, error: 'Email already exists' });
      }
    }

    if (studentCode) {
      const existingCode = await prisma.student.findUnique({ where: { studentCode } });
      if (existingCode) {
        return res.status(409).json({ success: false, error: 'Student code already exists' });
      }
    }

    const normalizedParentPhone = String(effectiveParent.phoneNumber).trim();
    let parentCreated = false;
    let createdOrReusedParent = null;
    let linkingResult = null;

    const result = await prisma.$transaction(async (tx) => {
      const parentRelationship = effectiveParent.relationship || 'Guardian';
      const parentOccupation = effectiveParent.occupation || null;
      const parentAddress = effectiveParent.address || null;
      const parentPasswordFromRequest = parentFromPayload
        ? String(effectiveParent.password || '').trim()
        : null;

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
                role: true,
              },
            },
          },
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
                    role: true,
                  },
                },
              },
            });
          }
        }
      }

      if (!parentRecord) {
        parentCreated = true;

        const normalizedParentFullName = String(effectiveParent.fullName).trim();
        const parentUserId = String(
          effectiveParent.userId || effectiveParent.parentId || `PAR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        ).trim();
        const phoneDigits = normalizedParentPhone.replace(/\D/g, '');
        const derivedUsername = `parent.${phoneDigits.slice(-10) || parentUserId}`.toLowerCase();
        const parentUsername = String(effectiveParent.username || derivedUsername).trim();
        const tempPassword = parentPasswordFromRequest || `Temp!${Date.now()}${Math.random().toString(36).slice(2, 8)}A1`;

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
            },
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
                  role: true,
                },
              },
            },
          });
        } catch (error) {
          if (error?.code !== 'P2002') throw error;

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
                  role: true,
                },
              },
            },
          });

          if (!parentRecord) throw error;
        }
      }

      if (parentRecord && parentPasswordFromRequest) {
        await tx.user.update({
          where: { userId: parentRecord.userId },
          data: {
            passwordHash: await bcrypt.hash(parentPasswordFromRequest, 10),
          },
        });
      }

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
        },
      });

      const student = await tx.student.create({
        data: {
          userId: studentUser.userId,
          schoolId,
          classId: normalizedClassId,
          studentCode: studentCode || null,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender: gender || null,
          guardianName: guardianName || effectiveParent.fullName || null,
          guardianPhone: guardianPhone || normalizedParentPhone || null,
          address: address || null,
          isActive: true,
        },
        include: {
          user: {
            select: {
              userId: true,
              username: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          class: {
            select: {
              classId: true,
              className: true,
              gradeLevel: true,
              section: true,
            },
          },
        },
      });

      const existingLink = await tx.parentStudent.findFirst({
        where: {
          parentId: parentRecord.parentId,
          studentId: student.studentId,
        },
      });

      linkingResult = existingLink || await tx.parentStudent.create({
        data: {
          parentId: parentRecord.parentId,
          studentId: student.studentId,
          relationship: parentRelationship,
          isPrimary: false,
        },
      });

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
      },
    });
  } catch (error) {
    console.error('Create admin student error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create student',
    });
  }
});

/**
 * @route   GET /api/admin/students
 * @desc    Get all students in school
 * @query   ?classId=1&isActive=true
 * @access  SCHOOL_ADMIN
 */
router.get('/', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { classId, isActive } = req.query;

    const where = { schoolId };

    if (classId) {
      where.classId = parseInt(classId);
    }

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
            fullName: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        class: {
          select: {
            classId: true,
            className: true,
            gradeLevel: true,
            section: true,
          },
        },
      },
      orderBy: [
        { class: { gradeLevel: 'asc' } },
        { class: { section: 'asc' } },
        { user: { fullName: 'asc' } },
      ],
    });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    console.error('Get admin students error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students',
    });
  }
});

module.exports = router;
