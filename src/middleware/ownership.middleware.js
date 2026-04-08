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
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
  ensureTeacherOwnsTeacherParam,
  ensureHomeroomOwnsParentParam,
};
