const prisma = require('../config/database');
const { writeAudit } = require('../utils/auditLogger');

function resolveClassId(req) {
  const raw =
    req.params?.classId ??
    req.body?.classId ??
    req.query?.classId ??
    req.query?.class_id;
  const classId = parseInt(raw, 10);
  return Number.isInteger(classId) ? classId : null;
}

const ensureTeacherAssignedClass = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toUpperCase();
    if (!['TEACHER', 'HOMEROOM_TEACHER'].includes(role)) return next();

    const classId = resolveClassId(req);
    if (!classId) {
      return res.status(400).json({ success: false, error: 'classId is required.' });
    }

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

    if (!membership) {
      writeAudit('auth.assignment_denied', {
        userId: req.user.userId,
        role,
        classId,
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
      });
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { ensureTeacherAssignedClass };
