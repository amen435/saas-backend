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

function buildTeacherInclude() {
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
    school: {
      select: {
        schoolId: true,
        schoolName: true,
        schoolCode: true,
      },
    },
    homeroomClasses: {
      select: {
        classId: true,
        className: true,
        gradeLevel: true,
        section: true,
        academicYear: true,
      },
    },
    classTeachers: {
      include: {
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
  };
}

async function syncHomeroomAssignment(tx, teacherId, schoolId, teacherRole, classId) {
  if (teacherRole !== 'HOMEROOM_TEACHER') {
    await tx.class.updateMany({
      where: {
        schoolId,
        homeroomTeacherId: teacherId,
      },
      data: {
        homeroomTeacherId: null,
      },
    });
    return null;
  }

  if (!classId) {
    return null;
  }

  const classRecord = await ensureSchoolClass(classId, schoolId);

  await tx.class.updateMany({
    where: {
      schoolId,
      homeroomTeacherId: teacherId,
      classId: { not: classRecord.classId },
    },
    data: {
      homeroomTeacherId: null,
    },
  });

  await tx.class.update({
    where: { classId: classRecord.classId },
    data: { homeroomTeacherId: teacherId },
  });

  return classRecord.classId;
}

const createTeacher = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const payload = req.validatedBody || req.body || {};
    const userId = normalizeRequiredString(payload.userId, 'userId');
    const username = normalizeRequiredString(payload.username, 'username');
    const password = normalizeRequiredString(payload.password, 'password');
    const fullName = normalizeRequiredString(payload.fullName, 'fullName');
    const teacherRole = String(payload.role || 'TEACHER').trim().toUpperCase();

    if (!['TEACHER', 'HOMEROOM_TEACHER'].includes(teacherRole)) {
      return res.status(400).json({
        success: false,
        error: 'Role must be TEACHER or HOMEROOM_TEACHER.',
      });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ success: false, error: passwordError });
    }

    await ensureUniqueUserIdentifiers({
      userId,
      username,
      email: normalizeOptionalString(payload.email),
    });

    const status = normalizeStatusInput(payload.status ?? payload.isActive, STATUS.ACTIVE);
    const sourceImage = payload.faceImageBase64 || payload.photoBase64;
    const biometric = await generateFaceEmbedding(sourceImage);
    const upload = await uploadImage({
      imageBase64: sourceImage,
      entity: 'teachers',
      identifier: userId,
    });

    const createdTeacher = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          userId,
          username,
          email: normalizeOptionalString(payload.email),
          passwordHash: await bcrypt.hash(password, 10),
          role: teacherRole,
          schoolId,
          fullName,
          phone: normalizeOptionalString(payload.phone),
          status,
          isActive: statusToActive(status),
          failedAttempts: 0,
        },
      });

      const teacher = await tx.teacher.create({
        data: {
          userId: user.userId,
          schoolId,
          status,
          specialization: normalizeOptionalString(payload.specialization),
          classId: payload.classId ? parseInteger(payload.classId, 'classId') : null,
          photoUrl: upload.photoUrl,
          photoBase64: null,
          faceEmbedding: biometric.faceEmbedding,
          isActive: statusToActive(status),
        },
      });

      const syncedClassId = await syncHomeroomAssignment(
        tx,
        teacher.teacherId,
        schoolId,
        teacherRole,
        payload.classId ? parseInteger(payload.classId, 'classId') : null
      );

      return tx.teacher.update({
        where: { teacherId: teacher.teacherId },
        data: { classId: syncedClassId ?? teacher.classId },
        include: buildTeacherInclude(),
      });
    });

    return res.status(201).json({
      success: true,
      message: 'Teacher created successfully.',
      data: createdTeacher,
    });
  } catch (error) {
    console.error('Create teacher error:', error);
    return sendError(res, error, 'Failed to create teacher.');
  }
};

const getAllTeachers = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const where = {
      schoolId,
      ...buildListFilters(req.query),
    };

    const role = String(req.query.role || '').trim().toUpperCase();
    if (['TEACHER', 'HOMEROOM_TEACHER'].includes(role)) {
      where.user = { role };
    }

    if (req.query.classId) {
      where.OR = [
        { classId: parseInteger(req.query.classId, 'classId') },
        { homeroomClasses: { some: { classId: parseInteger(req.query.classId, 'classId') } } },
      ];
    }

    const search = String(req.query.search || '').trim();
    if (search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { user: { fullName: { contains: search, mode: 'insensitive' } } },
            { user: { username: { contains: search, mode: 'insensitive' } } },
            { specialization: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const teachers = await prisma.teacher.findMany({
      where,
      include: buildTeacherInclude(),
      orderBy: [{ createdAt: 'desc' }, { teacherId: 'desc' }],
    });

    return res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers,
    });
  } catch (error) {
    console.error('Get all teachers error:', error);
    return sendError(res, error, 'Failed to fetch teachers.');
  }
};

const getTeacherById = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const teacherId = parseInteger(req.params.id || req.params.teacherId, 'teacherId');

    const teacher = await prisma.teacher.findFirst({
      where: {
        teacherId,
        schoolId,
      },
      include: buildTeacherInclude(),
    });

    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: teacher,
    });
  } catch (error) {
    console.error('Get teacher error:', error);
    return sendError(res, error, 'Failed to fetch teacher.');
  }
};

const updateTeacher = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const teacherId = parseInteger(req.params.id || req.params.teacherId, 'teacherId');
    const payload = req.validatedBody || req.body || {};

    const existingTeacher = await prisma.teacher.findFirst({
      where: { teacherId, schoolId },
      include: {
        user: {
          select: {
            userId: true,
            role: true,
          },
        },
      },
    });

    if (!existingTeacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found.' });
    }

    const teacherRole = payload.role
      ? String(payload.role).trim().toUpperCase()
      : existingTeacher.user.role;

    if (!['TEACHER', 'HOMEROOM_TEACHER'].includes(teacherRole)) {
      return res.status(400).json({ success: false, error: 'Role must be TEACHER or HOMEROOM_TEACHER.' });
    }

    if (payload.email) {
      await ensureUniqueUserIdentifiers({
        email: normalizeOptionalString(payload.email),
        excludeUserId: existingTeacher.userId,
      });
    }

    const status = payload.status !== undefined || payload.isActive !== undefined
      ? normalizeStatusInput(payload.status ?? payload.isActive, existingTeacher.status)
      : existingTeacher.status;

    const sourceImage = payload.faceImageBase64 || payload.photoBase64;
    const biometric = sourceImage
      ? await generateFaceEmbedding(sourceImage)
      : null;
    const upload = sourceImage
      ? await uploadImage({
          imageBase64: sourceImage,
          entity: 'teachers',
          identifier: existingTeacher.userId,
        })
      : null;

    const updatedTeacher = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId: existingTeacher.userId },
        data: {
          fullName: payload.fullName !== undefined ? normalizeRequiredString(payload.fullName, 'fullName') : undefined,
          email: payload.email !== undefined ? normalizeOptionalString(payload.email) : undefined,
          phone: payload.phone !== undefined ? normalizeOptionalString(payload.phone) : undefined,
          role: teacherRole,
          status,
          isActive: statusToActive(status),
        },
      });

      const nextClassId = payload.classId !== undefined
        ? (payload.classId ? parseInteger(payload.classId, 'classId') : null)
        : existingTeacher.classId;

      const syncedClassId = await syncHomeroomAssignment(tx, teacherId, schoolId, teacherRole, nextClassId);

      return tx.teacher.update({
        where: { teacherId },
        data: {
          specialization: payload.specialization !== undefined ? normalizeOptionalString(payload.specialization) : undefined,
          classId: teacherRole === 'HOMEROOM_TEACHER' ? syncedClassId ?? nextClassId : null,
          status,
          photoUrl: upload ? upload.photoUrl : undefined,
          photoBase64: biometric ? null : undefined,
          faceEmbedding: biometric ? biometric.faceEmbedding : undefined,
          isActive: statusToActive(status),
        },
        include: buildTeacherInclude(),
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Teacher updated successfully.',
      data: updatedTeacher,
    });
  } catch (error) {
    console.error('Update teacher error:', error);
    return sendError(res, error, 'Failed to update teacher.');
  }
};

const deleteTeacher = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const teacherId = parseInteger(req.params.id || req.params.teacherId, 'teacherId');

    const teacher = await prisma.teacher.findFirst({
      where: { teacherId, schoolId },
      select: { userId: true },
    });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId: teacher.userId },
        data: {
          status: STATUS.INACTIVE,
          isActive: false,
        },
      });

      await tx.teacher.update({
        where: { teacherId },
        data: {
          status: STATUS.INACTIVE,
          isActive: false,
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Teacher deactivated successfully.',
    });
  } catch (error) {
    console.error('Delete teacher error:', error);
    return sendError(res, error, 'Failed to delete teacher.');
  }
};

const updateTeacherStatus = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const teacherId = parseInteger(req.params.id || req.params.teacherId, 'teacherId');
    const status = normalizeStatusInput(req.body?.status ?? req.body?.isActive, STATUS.ACTIVE);

    const teacher = await prisma.teacher.findFirst({
      where: { teacherId, schoolId },
      select: { userId: true },
    });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found.' });
    }

    const updatedTeacher = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId: teacher.userId },
        data: {
          status,
          isActive: statusToActive(status),
        },
      });

      return tx.teacher.update({
        where: { teacherId },
        data: {
          status,
          isActive: statusToActive(status),
        },
        include: buildTeacherInclude(),
      });
    });

    return res.status(200).json({
      success: true,
      message: `Teacher ${status === STATUS.ACTIVE ? 'activated' : 'deactivated'} successfully.`,
      data: updatedTeacher,
    });
  } catch (error) {
    console.error('Update teacher status error:', error);
    return sendError(res, error, 'Failed to update teacher status.');
  }
};

const deactivateTeacher = async (req, res) => {
  req.body = { ...(req.body || {}), status: STATUS.INACTIVE };
  return updateTeacherStatus(req, res);
};

const activateTeacher = async (req, res) => {
  req.body = { ...(req.body || {}), status: STATUS.ACTIVE };
  return updateTeacherStatus(req, res);
};

const getMyClasses = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId,
        schoolId,
        isActive: true,
      },
      select: { teacherId: true },
    });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher record not found.' });
    }

    const taughtClasses = await prisma.classTeacher.findMany({
      where: { teacherId: teacher.teacherId },
      include: {
        class: {
          include: {
            _count: {
              select: { students: true },
            },
          },
        },
      },
    });

    const homeroomClasses = await prisma.class.findMany({
      where: {
        schoolId,
        homeroomTeacherId: teacher.teacherId,
        isActive: true,
      },
      include: {
        _count: {
          select: { students: true },
        },
      },
    });

    const merged = new Map();
    for (const item of taughtClasses) {
      merged.set(item.class.classId, {
        ...item.class,
        subjectTaught: item.subjectName || null,
        isHomeroom: item.class.homeroomTeacherId === teacher.teacherId,
      });
    }
    for (const item of homeroomClasses) {
      if (!merged.has(item.classId)) {
        merged.set(item.classId, {
          ...item,
          subjectTaught: null,
          isHomeroom: true,
        });
      }
    }

    return res.status(200).json({
      success: true,
      count: merged.size,
      data: Array.from(merged.values()),
    });
  } catch (error) {
    console.error('Get my classes error:', error);
    return sendError(res, error, 'Failed to fetch classes.');
  }
};

const getClassStudents = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const classId = parseInteger(req.params.classId, 'classId');

    const teacher = await prisma.teacher.findFirst({
      where: {
        userId,
        schoolId,
        isActive: true,
      },
      select: { teacherId: true },
    });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher record not found.' });
    }

    const classRecord = await prisma.class.findFirst({
      where: {
        classId,
        schoolId,
      },
      select: {
        classId: true,
        homeroomTeacherId: true,
      },
    });

    if (!classRecord) {
      return res.status(404).json({ success: false, error: 'Class not found.' });
    }

    const assignment = await prisma.classTeacher.findFirst({
      where: {
        classId,
        teacherId: teacher.teacherId,
      },
      select: { id: true },
    });

    if (!assignment && classRecord.homeroomTeacherId !== teacher.teacherId) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this class.',
      });
    }

    const students = await prisma.student.findMany({
      where: {
        schoolId,
        classId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            userId: true,
            fullName: true,
            username: true,
            status: true,
          },
        },
      },
      orderBy: { studentId: 'asc' },
    });

    return res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    console.error('Get class students error:', error);
    return sendError(res, error, 'Failed to fetch students.');
  }
};

const getMyProfile = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const teacher = await prisma.teacher.findFirst({
      where: {
        userId,
        schoolId,
      },
      include: buildTeacherInclude(),
    });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher record not found.' });
    }

    return res.status(200).json({
      success: true,
      data: teacher,
    });
  } catch (error) {
    console.error('Get teacher profile error:', error);
    return sendError(res, error, 'Failed to fetch profile.');
  }
};

const getMyAttendance = async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const teacher = await prisma.teacher.findFirst({
      where: { userId, schoolId },
      select: { teacherId: true },
    });

    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher record not found.' });
    }

    const where = {
      schoolId,
      teacherId: teacher.teacherId,
    };

    if (req.query.startDate || req.query.endDate) {
      where.attendanceDate = {};
      if (req.query.startDate) where.attendanceDate.gte = new Date(req.query.startDate);
      if (req.query.endDate) where.attendanceDate.lte = new Date(req.query.endDate);
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
    console.error('Get my attendance error:', error);
    return sendError(res, error, 'Failed to fetch attendance history.');
  }
};

module.exports = {
  activateTeacher,
  createTeacher,
  deactivateTeacher,
  deleteTeacher,
  getAllTeachers,
  getClassStudents,
  getMyAttendance,
  getMyClasses,
  getMyProfile,
  getTeacherById,
  updateTeacher,
  updateTeacherStatus,
};
