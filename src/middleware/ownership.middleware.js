const prisma = require('../config/database');
const { writeAudit } = require('../utils/auditLogger');

function deny(res, req, reason, status = 403) {
  writeAudit('auth.ownership_denied', {
    userId: req.user?.userId || null,
    role: req.user?.role || null,
    reason,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });
  return res.status(status).json({
    success: false,
    error: 'Access denied.',
  });
}

function getEffectiveRole(req) {
  return String(req.user?.activeRole || req.user?.role || '').toUpperCase();
}

function isAdminRole(role) {
  return role === 'SCHOOL_ADMIN' || role === 'SUPER_ADMIN';
}

function resolveIntegerFromSources(req, sources = []) {
  for (const source of sources) {
    const [containerName, ...pathParts] = String(source || '').split('.');
    const container = req?.[containerName];
    if (!container || pathParts.length === 0) continue;

    let value = container;
    for (const part of pathParts) {
      value = value?.[part];
    }

    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

async function teacherHasAssignedClassAccess(req, classId) {
  const membership = await prisma.class.findFirst({
    where: {
      classId,
      schoolId: req.user.schoolId,
      OR: [
        { homeroomTeacher: { userId: req.user.userId } },
        { classTeachers: { some: { teacher: { userId: req.user.userId } } } },
      ],
    },
    select: { classId: true },
  });

  return Boolean(membership);
}

async function teacherHasAssignedStudentAccess(req, studentId) {
  const student = await prisma.student.findFirst({
    where: {
      studentId,
      schoolId: req.user.schoolId,
      isActive: true,
      class: {
        OR: [
          { homeroomTeacher: { userId: req.user.userId } },
          { classTeachers: { some: { teacher: { userId: req.user.userId } } } },
        ],
      },
    },
    select: { studentId: true },
  });

  return Boolean(student);
}

function checkOwnership(options = {}) {
  const {
    classIdSources = [],
    studentIdSources = [],
    teacherIdSources = [],
    parentIdSources = [],
  } = options;

  return async (req, res, next) => {
    try {
      const role = getEffectiveRole(req);
      if (isAdminRole(role)) {
        return next();
      }

      const classId = resolveIntegerFromSources(req, classIdSources);
      const studentId = resolveIntegerFromSources(req, studentIdSources);
      const teacherId = resolveIntegerFromSources(req, teacherIdSources);
      const parentId = resolveIntegerFromSources(req, parentIdSources);

      if (['TEACHER', 'HOMEROOM_TEACHER'].includes(role)) {
        if (classId !== null) {
          const allowed = await teacherHasAssignedClassAccess(req, classId);
          if (!allowed) {
            return deny(res, req, 'teacher_attempt_unassigned_class');
          }
        }

        if (studentId !== null) {
          const allowed = await teacherHasAssignedStudentAccess(req, studentId);
          if (!allowed) {
            return deny(res, req, 'teacher_attempt_unassigned_student');
          }
        }

        if (teacherId !== null) {
          const teacher = await prisma.teacher.findFirst({
            where: { userId: req.user.userId, schoolId: req.user.schoolId },
            select: { teacherId: true },
          });

          if (!teacher) return deny(res, req, 'teacher_not_found', 404);
          if (teacher.teacherId !== teacherId) {
            return deny(res, req, 'teacher_attempt_other_teacher');
          }
        }

        if (parentId !== null) {
          const relation = await prisma.parentStudent.findFirst({
            where: {
              parentId,
              student: {
                schoolId: req.user.schoolId,
                class: {
                  OR: [
                    { homeroomTeacher: { userId: req.user.userId } },
                    { classTeachers: { some: { teacher: { userId: req.user.userId } } } },
                  ],
                },
              },
            },
            select: { id: true },
          });

          if (!relation) return deny(res, req, 'teacher_attempt_unassigned_parent');
        }

        return next();
      }

      if (role === 'STUDENT' && studentId !== null) {
        const student = await prisma.student.findFirst({
          where: { studentId, schoolId: req.user.schoolId },
          select: { userId: true },
        });
        if (!student) return deny(res, req, 'student_not_found', 404);
        if (String(student.userId) !== String(req.user.userId)) {
          return deny(res, req, 'student_attempt_other_student');
        }
      }

      if (role === 'PARENT' && studentId !== null) {
        const parent = await prisma.parent.findFirst({
          where: { userId: req.user.userId, schoolId: req.user.schoolId },
          select: { parentId: true },
        });
        if (!parent) return deny(res, req, 'parent_not_found', 404);

        const relation = await prisma.parentStudent.findFirst({
          where: { parentId: parent.parentId, studentId },
          select: { id: true },
        });
        if (!relation) {
          return deny(res, req, 'parent_attempt_non_child');
        }
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

const ensureStudentOwnsStudentParam = async (req, res, next) => {
  try {
    if (req.user?.role !== 'STUDENT') return next();
    const studentId = parseInt(req.params.studentId, 10);
    if (!Number.isInteger(studentId)) return deny(res, req, 'invalid_student_id', 400);

    const student = await prisma.student.findFirst({
      where: { studentId, schoolId: req.user.schoolId },
      select: { userId: true },
    });
    if (!student) return deny(res, req, 'student_not_found', 404);
    if (String(student.userId) !== String(req.user.userId)) {
      return deny(res, req, 'student_attempt_other_student');
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const ensureParentOwnsStudentParam = async (req, res, next) => {
  try {
    if (req.user?.role !== 'PARENT') return next();
    const studentId = parseInt(req.params.studentId, 10);
    if (!Number.isInteger(studentId)) return deny(res, req, 'invalid_student_id', 400);

    const parent = await prisma.parent.findFirst({
      where: { userId: req.user.userId, schoolId: req.user.schoolId },
      select: { parentId: true },
    });
    if (!parent) return deny(res, req, 'parent_not_found', 404);

    const relation = await prisma.parentStudent.findFirst({
      where: { parentId: parent.parentId, studentId },
      select: { id: true },
    });
    if (!relation) {
      return deny(res, req, 'parent_attempt_non_child');
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const ensureTeacherOwnsTeacherParam = async (req, res, next) => {
  try {
    if (!['TEACHER', 'HOMEROOM_TEACHER'].includes(req.user?.role)) return next();
    const teacherId = parseInt(req.params.teacherId, 10);
    if (!Number.isInteger(teacherId)) return deny(res, req, 'invalid_teacher_id', 400);

    const teacher = await prisma.teacher.findFirst({
      where: { userId: req.user.userId, schoolId: req.user.schoolId },
      select: { teacherId: true },
    });
    if (!teacher) return deny(res, req, 'teacher_not_found', 404);
    if (teacher.teacherId !== teacherId) {
      return deny(res, req, 'teacher_attempt_other_teacher');
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const ensureHomeroomOwnsParentParam = async (req, res, next) => {
  try {
    if (!['TEACHER', 'HOMEROOM_TEACHER'].includes(req.user?.role)) return next();
    const parentId = parseInt(req.params.parentId, 10);
    if (!Number.isInteger(parentId)) return deny(res, req, 'invalid_parent_id', 400);

    const relation = await prisma.parentStudent.findFirst({
      where: {
        parentId,
        student: {
          schoolId: req.user.schoolId,
          class: {
            homeroomTeacher: {
              userId: req.user.userId,
            },
          },
        },
      },
      select: { id: true },
    });

    if (!relation) return deny(res, req, 'homeroom_parent_not_owned');
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  checkOwnership,
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
  ensureTeacherOwnsTeacherParam,
  ensureHomeroomOwnsParentParam,
  resolveIntegerFromSources,
};
