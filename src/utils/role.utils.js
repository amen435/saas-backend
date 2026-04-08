const prisma = require('../config/database');

/**
 * Derive all available roles for a user based on:
 * - Base role from JWT / user record
 * - Teacher record in the same school
 * - Homeroom assignment via Class.homeroomTeacherId
 *
 * Does NOT change any data, only reads.
 *
 * @param {{ userId: string, role: string, schoolId: number | null }} userLike
 * @returns {Promise<string[]>}
 */
async function getAvailableRolesForUser(userLike) {
  const { userId, role, schoolId } = userLike || {};

  const roles = new Set();
  if (role) {
    roles.add(role);
  }

  if ((role === 'TEACHER' || role === 'HOMEROOM_TEACHER') && schoolId) {
    // All teacher-like users have TEACHER capability
    roles.add('TEACHER');

    const teacher = await prisma.teacher.findFirst({
      where: {
        userId,
        schoolId,
        isActive: true,
      },
      select: { teacherId: true },
    });

    if (teacher) {
      const homeroomClass = await prisma.class.findFirst({
        where: {
          schoolId,
          homeroomTeacherId: teacher.teacherId,
          isActive: true,
        },
        select: { classId: true },
      });

      if (homeroomClass) {
        roles.add('HOMEROOM_TEACHER');
      }
    }
  }

  return Array.from(roles);
}

module.exports = {
  getAvailableRolesForUser,
};

