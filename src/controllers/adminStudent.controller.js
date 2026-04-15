const bcrypt = require('bcrypt');
const prisma = require('../config/database');
const { validatePasswordStrength } = require('../utils/password.utils');
const { generateFaceEmbedding } = require('../services/faceEmbedding.service');
const { uploadImage } = require('../services/uploadService');
const {
  STATUS,
  buildListFilters,
  ensureSchoolClass,
  ensureUniqueUserIdentifiers,
  normalizeOptionalString,
  normalizeRequiredString,
  normalizeStatusInput,
  parseInteger,
  statusToActive,
} = require('../utils/adminManagement.utils');

function sendError(res, error, fallbackMessage) {
  const statusCode = error?.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    error: statusCode === 500 ? fallbackMessage : error.message,
  });
}

async function resolveStudentScope(req) {
  const { schoolId, userId, activeRole, role } = req.user;
  const effectiveRole = String(activeRole || role || '').toUpperCase();

  if (['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(effectiveRole)) {
    return { schoolId, mode: 'admin' };
  }

  if (effectiveRole === 'HOMEROOM_TEACHER') {
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId, isActive: true },
      select: { teacherId: true },
    });

    if (!teacher) {
      throw Object.assign(new Error('Teacher record not found.'), { statusCode: 404 });
    }

    const classes = await prisma.class.findMany({
      where: {
        schoolId,
        homeroomTeacherId: teacher.teacherId,
        isActive: true,
      },
      select: { classId: true },
    });

    return {
      schoolId,
      mode: 'class',
      classIds: classes.map((item) => item.classId),
    };
  }

  if (effectiveRole === 'TEACHER') {
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId, isActive: true },
      select: { teacherId: true },
    });

    if (!teacher) {
      throw Object.assign(new Error('Teacher record not found.'), { statusCode: 404 });
    }

    const assignments = await prisma.classTeacher.findMany({
      where: { teacherId: teacher.teacherId },
      select: { classId: true },
    });

    return {
      schoolId,
      mode: 'class',
      classIds: Array.from(new Set(assignments.map((item) => item.classId))),
    };
  }

  if (effectiveRole === 'PARENT') {
    const parent = await prisma.parent.findFirst({
      where: { userId, schoolId, isActive: true },
      select: { parentId: true },
    });

    if (!parent) {
      throw Object.assign(new Error('Parent record not found.'), { statusCode: 404 });
    }

    const links = await prisma.parentStudent.findMany({
      where: { parentId: parent.parentId },
      select: { studentId: true },
    });

    return {
      schoolId,
      mode: 'student',
      studentIds: links.map((item) => item.studentId),
    };
  }

  throw Object.assign(new Error('Access denied. Insufficient permissions.'), { statusCode: 403 });
}

function buildStudentInclude() {
  return {
    user: {
      select: {
        userId: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        status: true,
        isActive: true,
        lastLogin: true,
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
    parents: {
      select: {
        relationship: true,
        isPrimary: true,
        parent: {
          select: {
            parentId: true,
            phoneNumber: true,
            address: true,
            user: {
              select: {
                userId: true,
                username: true,
                fullName: true,
                email: true,
                phone: true,
                status: true,
                isActive: true,
              },
            },
          },
        },
      },
    },
  };
}

async function createOrReuseParent(tx, schoolId, parentPayload) {
  const phoneNumber = normalizeRequiredString(parentPayload?.phoneNumber, 'parent.phoneNumber');
  const fullName = normalizeRequiredString(parentPayload?.fullName, 'parent.fullName');
  const relationship = normalizeOptionalString(parentPayload?.relationship) || 'Guardian';

  let parent = await tx.parent.findFirst({
    where: { schoolId, phoneNumber },
    include: {
      user: {
        select: {
          userId: true,
          username: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          isActive: true,
        },
      },
    },
  });

  if (parent) {
    return { parent, relationship, parentCreated: false };
  }

  const parentUserId = normalizeRequiredString(parentPayload?.userId, 'parent.userId');
  const parentPassword = normalizeRequiredString(parentPayload?.password, 'parent.password');
  const passwordError = validatePasswordStrength(parentPassword);
  if (passwordError) {
    throw Object.assign(new Error(passwordError), { statusCode: 400 });
  }

  await ensureUniqueUserIdentifiers({
    userId: parentUserId,
    username: normalizeOptionalString(parentPayload?.username),
    email: normalizeOptionalString(parentPayload?.email),
  });

  const parentUser = await tx.user.create({
    data: {
      userId: parentUserId,
      username: normalizeOptionalString(parentPayload?.username) || `parent.${phoneNumber.replace(/\D/g, '').slice(-8) || Date.now()}`,
      email: normalizeOptionalString(parentPayload?.email),
      passwordHash: await bcrypt.hash(parentPassword, 10),
      role: 'PARENT',
      schoolId,
      fullName,
      phone: phoneNumber,
      status: STATUS.ACTIVE,
      isActive: true,
      failedAttempts: 0,
    },
  });

  parent = await tx.parent.create({
    data: {
      userId: parentUser.userId,
      schoolId,
      relationship,
      occupation: normalizeOptionalString(parentPayload?.occupation),
      address: normalizeOptionalString(parentPayload?.address),
      phoneNumber,
      isActive: true,
    },
    include: {
      user: {
        select: {
          userId: true,
          username: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          isActive: true,
        },
      },
    },
  });

  return { parent, relationship, parentCreated: true };
}

const createStudent = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const body = req.validatedBody || req.body || {};
    const payload = body?.student || body || {};
    const parentPayload = body?.parent || payload.parent || null;

    const userId = normalizeRequiredString(payload.userId, 'userId');
    const username = normalizeRequiredString(payload.username, 'username');
    const password = normalizeRequiredString(payload.password, 'password');
    const fullName = normalizeRequiredString(payload.fullName, 'fullName');
    const classId = parseInteger(payload.classId, 'classId');
    const status = normalizeStatusInput(payload.status ?? payload.isActive, STATUS.ACTIVE);

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ success: false, error: passwordError });
    }

    if (!parentPayload) {
      return res.status(400).json({
        success: false,
        error: 'Parent information is required.',
      });
    }

    await ensureUniqueUserIdentifiers({
      userId,
      username,
      email: normalizeOptionalString(payload.email),
    });

    if (payload.studentCode) {
      const existingCode = await prisma.student.findUnique({
        where: { studentCode: String(payload.studentCode).trim() },
        select: { studentId: true },
      });
      if (existingCode) {
        return res.status(409).json({ success: false, error: 'Student code already exists.' });
      }
    }

    await ensureSchoolClass(classId, schoolId);
    const sourceImage = payload.faceImageBase64 || payload.photoBase64;
    const biometric = await generateFaceEmbedding(sourceImage);
    const upload = await uploadImage({
      imageBase64: sourceImage,
      entity: 'students',
      identifier: userId,
    });

    const result = await prisma.$transaction(async (tx) => {
      const { parent, relationship, parentCreated } = await createOrReuseParent(tx, schoolId, parentPayload);
      const user = await tx.user.create({
        data: {
          userId,
          username,
          email: normalizeOptionalString(payload.email),
          passwordHash: await bcrypt.hash(password, 10),
          role: 'STUDENT',
          schoolId,
          fullName,
          phone: normalizeOptionalString(payload.phone),
          status,
          isActive: statusToActive(status),
          failedAttempts: 0,
        },
      });

      const student = await tx.student.create({
        data: {
          userId: user.userId,
          schoolId,
          classId,
          status,
          studentCode: normalizeOptionalString(payload.studentCode),
          dateOfBirth: payload.dateOfBirth || payload.dob ? new Date(payload.dateOfBirth || payload.dob) : null,
          gender: normalizeOptionalString(payload.gender),
          guardianName: normalizeOptionalString(payload.guardianName) || parent.user.fullName,
          guardianPhone: normalizeOptionalString(payload.guardianPhone) || parent.phoneNumber,
          address: normalizeOptionalString(payload.address),
          photoUrl: upload.photoUrl,
          photoBase64: null,
          faceEmbedding: biometric.faceEmbedding,
          isActive: statusToActive(status),
        },
        include: buildStudentInclude(),
      });

      await tx.parentStudent.upsert({
        where: {
          parentId_studentId: {
            parentId: parent.parentId,
            studentId: student.studentId,
          },
        },
        create: {
          parentId: parent.parentId,
          studentId: student.studentId,
          relationship,
          isPrimary: true,
        },
        update: {
          relationship,
        },
      });

      return {
        student,
        parent,
        parentCreated,
      };
    });

    return res.status(201).json({
      success: true,
      message: 'Student created successfully.',
      data: result,
    });
  } catch (error) {
    console.error('Create student error:', error);
    return sendError(res, error, 'Failed to create student.');
  }
};

const listStudents = async (req, res) => {
  try {
    const scope = await resolveStudentScope(req);
    const where = {
      schoolId: scope.schoolId,
      ...buildListFilters(req.query),
    };

    if (req.query.classId) {
      where.classId = parseInteger(req.query.classId, 'classId');
    }

    const search = String(req.query.search || '').trim();
    if (search) {
      where.OR = [
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { user: { username: { contains: search, mode: 'insensitive' } } },
        { guardianName: { contains: search, mode: 'insensitive' } },
        { studentCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (scope.mode === 'class') {
      where.classId = where.classId
        ? where.classId
        : { in: scope.classIds.length ? scope.classIds : [-1] };

      if (Array.isArray(scope.classIds) && where.classId && typeof where.classId === 'number' && !scope.classIds.includes(where.classId)) {
        return res.status(403).json({ success: false, error: 'Access denied for the requested class.' });
      }
    }

    if (scope.mode === 'student') {
      where.studentId = { in: scope.studentIds.length ? scope.studentIds : [-1] };
    }

    const students = await prisma.student.findMany({
      where,
      include: buildStudentInclude(),
      orderBy: [
        { createdAt: 'desc' },
        { studentId: 'desc' },
      ],
    });

    return res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    console.error('List students error:', error);
    return sendError(res, error, 'Failed to fetch students.');
  }
};

const getStudentById = async (req, res) => {
  try {
    const scope = await resolveStudentScope(req);
    const studentId = parseInteger(req.params.id || req.params.studentId, 'studentId');
    const where = {
      studentId,
      schoolId: scope.schoolId,
    };

    if (scope.mode === 'class') {
      where.classId = { in: scope.classIds.length ? scope.classIds : [-1] };
    }

    if (scope.mode === 'student') {
      where.studentId = { in: scope.studentIds.length ? scope.studentIds : [-1] };
    }

    const student = await prisma.student.findFirst({
      where,
      include: buildStudentInclude(),
    });

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    return res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    console.error('Get student error:', error);
    return sendError(res, error, 'Failed to fetch student.');
  }
};

const updateStudent = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const studentId = parseInteger(req.params.id || req.params.studentId, 'studentId');
    const payload = req.validatedBody || req.body || {};

    const existingStudent = await prisma.student.findFirst({
      where: {
        studentId,
        schoolId,
      },
      include: {
        parents: {
          select: {
            parentId: true,
            parent: {
              select: {
                userId: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    if (!existingStudent) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    if (payload.email) {
      await ensureUniqueUserIdentifiers({
        email: normalizeOptionalString(payload.email),
        excludeUserId: existingStudent.userId,
      });
    }

    if (payload.studentCode) {
      const existingCode = await prisma.student.findFirst({
        where: {
          studentCode: String(payload.studentCode).trim(),
          studentId: { not: studentId },
        },
        select: { studentId: true },
      });
      if (existingCode) {
        return res.status(409).json({ success: false, error: 'Student code already exists.' });
      }
    }

    let classId;
    if (payload.classId !== undefined) {
      const classRecord = await ensureSchoolClass(payload.classId, schoolId);
      classId = classRecord.classId;
    }

    const status = payload.status !== undefined || payload.isActive !== undefined
      ? normalizeStatusInput(payload.status ?? payload.isActive, existingStudent.status)
      : existingStudent.status;

    const sourceImage = payload.faceImageBase64 || payload.photoBase64;
    const biometric = sourceImage
      ? await generateFaceEmbedding(sourceImage)
      : null;
    const upload = sourceImage
      ? await uploadImage({
          imageBase64: sourceImage,
          entity: 'students',
          identifier: existingStudent.userId,
        })
      : null;

    const updatedStudent = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId: existingStudent.userId },
        data: {
          fullName: payload.fullName !== undefined ? normalizeRequiredString(payload.fullName, 'fullName') : undefined,
          phone: payload.phone !== undefined ? normalizeOptionalString(payload.phone) : undefined,
          email: payload.email !== undefined ? normalizeOptionalString(payload.email) : undefined,
          status,
          isActive: statusToActive(status),
        },
      });

      if (payload.parent && existingStudent.parents[0]?.parent?.userId) {
        await tx.user.update({
          where: { userId: existingStudent.parents[0].parent.userId },
          data: {
            fullName: payload.parent.fullName !== undefined ? normalizeOptionalString(payload.parent.fullName) : undefined,
            phone: payload.parent.phoneNumber !== undefined ? normalizeOptionalString(payload.parent.phoneNumber) : undefined,
            email: payload.parent.email !== undefined ? normalizeOptionalString(payload.parent.email) : undefined,
          },
        });

        await tx.parent.update({
          where: { parentId: existingStudent.parents[0].parentId },
          data: {
            relationship: payload.parent.relationship !== undefined ? normalizeOptionalString(payload.parent.relationship) : undefined,
            address: payload.parent.address !== undefined ? normalizeOptionalString(payload.parent.address) : undefined,
            phoneNumber: payload.parent.phoneNumber !== undefined ? normalizeOptionalString(payload.parent.phoneNumber) : undefined,
          },
        });
      }

      return tx.student.update({
        where: { studentId },
        data: {
          classId: classId ?? undefined,
          status,
          studentCode: payload.studentCode !== undefined ? normalizeOptionalString(payload.studentCode) : undefined,
          dateOfBirth: payload.dateOfBirth || payload.dob ? new Date(payload.dateOfBirth || payload.dob) : undefined,
          gender: payload.gender !== undefined ? normalizeOptionalString(payload.gender) : undefined,
          guardianName: payload.guardianName !== undefined ? normalizeOptionalString(payload.guardianName) : undefined,
          guardianPhone: payload.guardianPhone !== undefined ? normalizeOptionalString(payload.guardianPhone) : undefined,
          address: payload.address !== undefined ? normalizeOptionalString(payload.address) : undefined,
          photoUrl: upload ? upload.photoUrl : undefined,
          photoBase64: biometric ? null : undefined,
          faceEmbedding: biometric ? biometric.faceEmbedding : undefined,
          isActive: statusToActive(status),
        },
        include: buildStudentInclude(),
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Student updated successfully.',
      data: updatedStudent,
    });
  } catch (error) {
    console.error('Update student error:', error);
    return sendError(res, error, 'Failed to update student.');
  }
};

const deleteStudent = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const studentId = parseInteger(req.params.id || req.params.studentId, 'studentId');

    const student = await prisma.student.findFirst({
      where: { studentId, schoolId },
      select: { studentId: true, userId: true },
    });

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId: student.userId },
        data: {
          status: STATUS.INACTIVE,
          isActive: false,
        },
      });

      await tx.student.update({
        where: { studentId },
        data: {
          status: STATUS.INACTIVE,
          isActive: false,
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Student deactivated successfully.',
    });
  } catch (error) {
    console.error('Delete student error:', error);
    return sendError(res, error, 'Failed to delete student.');
  }
};

const updateStudentStatus = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const studentId = parseInteger(req.params.id || req.params.studentId, 'studentId');
    const status = normalizeStatusInput(req.body?.status ?? req.body?.isActive, STATUS.ACTIVE);

    const student = await prisma.student.findFirst({
      where: { studentId, schoolId },
      select: { userId: true },
    });

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    const data = {
      status,
      isActive: statusToActive(status),
    };

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId: student.userId },
        data,
      });

      return tx.student.update({
        where: { studentId },
        data,
        include: buildStudentInclude(),
      });
    });

    return res.status(200).json({
      success: true,
      message: `Student ${status === STATUS.ACTIVE ? 'activated' : 'deactivated'} successfully.`,
      data: updated,
    });
  } catch (error) {
    console.error('Update student status error:', error);
    return sendError(res, error, 'Failed to update student status.');
  }
};

const deactivateStudent = async (req, res) => {
  req.body = { ...(req.body || {}), status: STATUS.INACTIVE };
  return updateStudentStatus(req, res);
};

const activateStudent = async (req, res) => {
  req.body = { ...(req.body || {}), status: STATUS.ACTIVE };
  return updateStudentStatus(req, res);
};

module.exports = {
  activateStudent,
  createStudent,
  deactivateStudent,
  deleteStudent,
  getStudentById,
  listStudents,
  updateStudent,
  updateStudentStatus,
};
