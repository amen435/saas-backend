// src/services/announcement.service.js

const prisma = require('../config/database');
const { isExpired } = require('../utils/announcementValidation');

/** School-wide: who can see this targetRole */
function viewerMatchesSchoolTargetRole(targetRole, userRole) {
  if (targetRole === 'ALL') return true;
  if (targetRole === 'SCHOOL_ADMIN') return userRole === 'SCHOOL_ADMIN';
  if (targetRole === 'TEACHERS') return userRole === 'TEACHER' || userRole === 'HOMEROOM_TEACHER';
  if (targetRole === 'STUDENTS') return userRole === 'STUDENT';
  if (targetRole === 'PARENTS') return userRole === 'PARENT';
  return false;
}

/** Class-scoped: user must already be in allowedClassIds */
function viewerMatchesClassTargetRole(targetRole, userRole) {
  if (targetRole === 'ALL') {
    return (
      userRole === 'STUDENT'
      || userRole === 'PARENT'
      || userRole === 'TEACHER'
      || userRole === 'HOMEROOM_TEACHER'
    );
  }
  if (targetRole === 'TEACHERS') return userRole === 'TEACHER' || userRole === 'HOMEROOM_TEACHER';
  if (targetRole === 'STUDENTS') return userRole === 'STUDENT';
  if (targetRole === 'PARENTS') return userRole === 'PARENT';
  if (targetRole === 'SCHOOL_ADMIN') return false;
  return false;
}

class AnnouncementService {
  embedAudienceMeta(message, audienceType, classId) {
    const meta = { audienceType: audienceType || 'SCHOOL', classId: classId ?? null };
    return `${message}\n<!--audience:${JSON.stringify(meta)}-->`;
  }

  parseAudienceMeta(message) {
    const raw = String(message || '');
    const match = raw.match(/<!--audience:(\{[\s\S]*\})-->$/);
    if (!match) return { cleanMessage: raw, audienceType: 'SCHOOL', classId: null };
    try {
      const meta = JSON.parse(match[1]);
      return {
        cleanMessage: raw.replace(match[0], '').trim(),
        audienceType: meta?.audienceType || 'SCHOOL',
        classId: meta?.classId != null ? Number(meta.classId) : null,
      };
    } catch {
      return { cleanMessage: raw, audienceType: 'SCHOOL', classId: null };
    }
  }

  normalizeAnnouncement(announcement) {
    const parsed = this.parseAudienceMeta(announcement?.message);
    return {
      ...announcement,
      message: parsed.cleanMessage,
      audienceType: parsed.audienceType,
      classId: parsed.classId,
    };
  }
  /**
   * Create announcement
   */
  async createAnnouncement(data, schoolId, createdBy) {
    const announcement = await prisma.announcement.create({
      data: {
        schoolId,
        title: data.title,
        message: this.embedAudienceMeta(data.message, data.audienceType, data.classId),
        targetRole: data.targetRole,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        createdBy,
      },
      include: {
        creator: {
          select: {
            userId: true,
            fullName: true,
            role: true,
          },
        },
        school: {
          select: {
            schoolName: true,
            schoolCode: true,
          },
        },
      },
    });

    return this.normalizeAnnouncement(announcement);
  }

  /**
   * Get all announcements for a school (admin view)
   */
  async getAllAnnouncements(schoolId, filters = {}) {
    const where = {};

    if (schoolId) {
      where.schoolId = schoolId;
    }

    if (filters.targetRole) {
      where.targetRole = filters.targetRole;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive === 'true';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { expiryDate: null },
          { expiryDate: { gte: today } },
        ],
      },
    ];

    const announcements = await prisma.announcement.findMany({
      where,
      include: {
        creator: {
          select: {
            userId: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Mark expired announcements
    let announcementsWithStatus = announcements.map(announcement => ({
      ...this.normalizeAnnouncement(announcement),
      isExpired: isExpired(announcement.expiryDate),
    }));

    if (filters.classId) {
      announcementsWithStatus = announcementsWithStatus.filter((a) => Number(a.classId) === Number(filters.classId));
    }

    return announcementsWithStatus;
  }

  /**
   * Get announcements for a specific role (user view)
   */
  async getAnnouncementsByRole(schoolId, user) {
    const userRole = user?.role;
    const userId = user?.userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where = {
      isActive: true,
      ...(schoolId ? { schoolId } : {}),
    };

    // Exclude expired announcements
    where.AND = [
      {
        OR: [
          { expiryDate: null },
          { expiryDate: { gte: today } },
        ],
      },
    ];

    const announcementsRaw = await prisma.announcement.findMany({
      where,
      include: {
        creator: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const announcements = announcementsRaw.map((a) => this.normalizeAnnouncement(a));

    // Resolve class visibility by role.
    let allowedClassIds = [];
    if (userRole === 'TEACHER' || userRole === 'HOMEROOM_TEACHER') {
      const teacher = await prisma.teacher.findFirst({
        where: { userId, schoolId },
        select: { teacherId: true },
      });
      if (teacher?.teacherId) {
        const classTeachers = await prisma.classTeacher.findMany({
          where: { teacherId: teacher.teacherId },
          select: { classId: true },
        });
        const homeroom = await prisma.class.findMany({
          where: { schoolId, homeroomTeacherId: teacher.teacherId },
          select: { classId: true },
        });
        allowedClassIds = [
          ...new Set([...classTeachers.map((c) => c.classId), ...homeroom.map((c) => c.classId)]),
        ];
      }
    } else if (userRole === 'STUDENT') {
      const student = await prisma.student.findFirst({
        where: { userId, schoolId },
        select: { classId: true },
      });
      allowedClassIds = student?.classId ? [student.classId] : [];
    } else if (userRole === 'PARENT') {
      const parent = await prisma.parent.findFirst({
        where: { userId, schoolId },
        select: { parentId: true },
      });
      if (parent?.parentId) {
        const links = await prisma.parentStudent.findMany({
          where: { parentId: parent.parentId },
          include: { student: { select: { classId: true } } },
        });
        allowedClassIds = links.map((l) => l?.student?.classId).filter(Boolean);
      }
    }

    const classIdSet = new Set(allowedClassIds.map((id) => Number(id)));
    return announcements.filter((a) => {
      if (a.audienceType === 'CLASS') {
        if (!classIdSet.has(Number(a.classId))) return false;
        return viewerMatchesClassTargetRole(a.targetRole, userRole);
      }
      return viewerMatchesSchoolTargetRole(a.targetRole, userRole);
    });
  }

  /**
   * Get single announcement
   */
  async getAnnouncementById(announcementId, schoolId) {
    const where = {
      announcementId,
    };

    if (schoolId) {
      where.schoolId = schoolId;
    }

    const announcement = await prisma.announcement.findFirst({
      where,
      include: {
        creator: {
          select: {
            userId: true,
            fullName: true,
            role: true,
          },
        },
        school: {
          select: {
            schoolName: true,
          },
        },
      },
    });

    if (!announcement) {
      throw new Error('Announcement not found');
    }

    return {
      ...announcement,
      ...this.parseAudienceMeta(announcement.message),
      isExpired: isExpired(announcement.expiryDate),
    };
  }

  /**
   * Update announcement
   */
  async updateAnnouncement(announcementId, data, schoolId) {
    const where = {
      announcementId,
    };

    if (schoolId) {
      where.schoolId = schoolId;
    }

    const announcement = await prisma.announcement.findFirst({
      where,
    });

    if (!announcement) {
      throw new Error('Announcement not found');
    }

    const updated = await prisma.announcement.update({
      where: {
        announcementId,
      },
      data: {
        title: data.title || announcement.title,
        message: data.message
          ? this.embedAudienceMeta(
              data.message,
              data.audienceType || this.parseAudienceMeta(announcement.message).audienceType,
              data.classId ?? this.parseAudienceMeta(announcement.message).classId
            )
          : announcement.message,
        targetRole: data.targetRole || announcement.targetRole,
        expiryDate: data.expiryDate !== undefined 
          ? (data.expiryDate ? new Date(data.expiryDate) : null)
          : announcement.expiryDate,
      },
      include: {
        creator: {
          select: {
            fullName: true,
          },
        },
      },
    });

    return this.normalizeAnnouncement(updated);
  }

  /**
   * Delete announcement
   */
  async deleteAnnouncement(announcementId, schoolId) {
    const where = {
      announcementId,
    };

    if (schoolId) {
      where.schoolId = schoolId;
    }

    const announcement = await prisma.announcement.findFirst({
      where,
    });

    if (!announcement) {
      throw new Error('Announcement not found');
    }

    await prisma.announcement.delete({
      where: {
        announcementId,
      },
    });

    return this.normalizeAnnouncement(announcement);
  }

  /**
   * Deactivate announcement (soft delete)
   */
  async deactivateAnnouncement(announcementId, schoolId) {
    const announcement = await prisma.announcement.findFirst({
      where: {
        announcementId,
        schoolId,
      },
    });

    if (!announcement) {
      throw new Error('Announcement not found');
    }

    const updated = await prisma.announcement.update({
      where: {
        announcementId,
      },
      data: {
        isActive: false,
      },
    });

    return updated;
  }

  /**
   * Get announcement statistics
   */
  async getAnnouncementStats(schoolId) {
    const total = await prisma.announcement.count({
      where: { schoolId },
    });

    const active = await prisma.announcement.count({
      where: {
        schoolId,
        isActive: true,
      },
    });

    const byRole = await prisma.announcement.groupBy({
      by: ['targetRole'],
      where: { schoolId },
      _count: true,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expired = await prisma.announcement.count({
      where: {
        schoolId,
        expiryDate: {
          lt: today,
        },
      },
    });

    return {
      total,
      active,
      inactive: total - active,
      expired,
      byRole: byRole.map(item => ({
        targetRole: item.targetRole,
        count: item._count,
      })),
    };
  }
}

module.exports = new AnnouncementService();