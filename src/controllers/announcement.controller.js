// src/controllers/announcement.controller.js

const announcementService = require('../services/announcement.service');
const {
  validateAnnouncementData,
  sanitizeAnnouncementData,
  normalizeTargetRole,
} = require('../utils/announcementValidation');
const prisma = require('../config/database');

const isTeacherRole = (role) => role === 'TEACHER' || role === 'HOMEROOM_TEACHER';

/**
 * @route   POST /api/announcements
 * @desc    Create announcement
 * @access  SCHOOL_ADMIN only
 */
const createAnnouncement = async (req, res) => {
  try {
    // eslint-disable-next-line no-console
    console.log('user:', req.user);
    // eslint-disable-next-line no-console
    console.log('payload:', req.body);
    const { schoolId: userSchoolId, userId, role } = req.user;
    const data = req.body;
    const targetType = String(data.targetType || 'SINGLE_SCHOOL').toUpperCase();
    const requestedSchoolId = data.schoolId || req.query.schoolId ? Number(data.schoolId || req.query.schoolId) : null;
    const requestedSchoolIds = Array.isArray(data.schoolIds)
      ? [...new Set(data.schoolIds.map((id) => Number(id)).filter(Boolean))]
      : [];

    let targetSchoolIds = [];
    if (role === 'SUPER_ADMIN') {
      if (!['SINGLE_SCHOOL', 'MULTI_SCHOOL', 'ALL_SCHOOLS'].includes(targetType)) {
        return res.status(400).json({
          success: false,
          message: 'targetType must be SINGLE_SCHOOL, MULTI_SCHOOL, or ALL_SCHOOLS',
        });
      }

      if (targetType === 'SINGLE_SCHOOL') {
        if (!requestedSchoolId) {
          return res.status(400).json({ success: false, message: 'Please select a school' });
        }
        targetSchoolIds = [requestedSchoolId];
      } else if (targetType === 'MULTI_SCHOOL') {
        if (requestedSchoolIds.length === 0) {
          return res.status(400).json({ success: false, message: 'Please select at least one school' });
        }
        targetSchoolIds = requestedSchoolIds;
      } else {
        const schools = await prisma.school.findMany({
          where: { isActive: true },
          select: { schoolId: true },
        });
        targetSchoolIds = schools.map((s) => s.schoolId);
        if (targetSchoolIds.length === 0) {
          return res.status(400).json({ success: false, message: 'No active schools found' });
        }
      }
    } else {
      if (!userSchoolId) {
        return res.status(400).json({ success: false, message: 'schoolId is required' });
      }
      targetSchoolIds = [userSchoolId];
    }

    // Validate input
    const errors = validateAnnouncementData(data);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
      });
    }

    // Sanitize data
    const sanitized = sanitizeAnnouncementData(data);

    if (isTeacherRole(role)) {
      sanitized.targetRole = 'ALL';
    }

    // Role-based targetRole rules (Prisma enum: ALL, TEACHERS, STUDENTS, PARENTS, SCHOOL_ADMIN)
    if (role === 'SUPER_ADMIN') {
      const tr = normalizeTargetRole(data.targetRole || sanitized.targetRole);
      if (!['ALL', 'SCHOOL_ADMIN'].includes(tr)) {
        return res.status(400).json({
          success: false,
          message: 'Super admin announcements must target ALL or SCHOOL_ADMIN only',
        });
      }
      sanitized.targetRole = tr;
    } else if (role === 'SCHOOL_ADMIN') {
      const tr = normalizeTargetRole(data.targetRole || sanitized.targetRole);
      if (!['ALL', 'TEACHERS', 'STUDENTS', 'PARENTS'].includes(tr)) {
        return res.status(400).json({
          success: false,
          message: 'School admin must target ALL, TEACHERS, STUDENTS, or PARENTS (one at a time)',
        });
      }
      sanitized.targetRole = tr;
    }

    // Role-based creation rules
    if (role === 'SUPER_ADMIN' && sanitized.audienceType !== 'SCHOOL') {
      return res.status(403).json({
        success: false,
        error: 'Super admin can create SCHOOL announcements only',
      });
    }

    if (isTeacherRole(role) && sanitized.audienceType !== 'CLASS') {
      return res.status(403).json({
        success: false,
        error: 'Teachers can create CLASS announcements only',
      });
    }

    if (isTeacherRole(role)) {
      const teacher = await prisma.teacher.findFirst({
        where: { userId, schoolId: targetSchoolIds[0] },
        select: { teacherId: true },
      });
      if (!teacher?.teacherId) {
        return res.status(403).json({ success: false, error: 'Teacher record not found' });
      }

      const requestedClassId = Number(sanitized.classId);
      const assignedClasses = await prisma.classTeacher.findMany({
        where: { teacherId: teacher.teacherId },
        select: { classId: true },
      });
      const canTeachClass = assignedClasses.some((row) => Number(row.classId) === requestedClassId);
      if (!canTeachClass) {
        return res.status(403).json({
          success: false,
          error: 'Teachers can only create announcements for classes they teach',
        });
      }

      if (role === 'HOMEROOM_TEACHER') {
        const homeroomClass = await prisma.class.findFirst({
          where: { schoolId: targetSchoolIds[0], homeroomTeacherId: teacher.teacherId },
          select: { classId: true },
        });
        if (!homeroomClass?.classId || requestedClassId !== Number(homeroomClass.classId)) {
          return res.status(403).json({
            success: false,
            error: 'Homeroom teachers can create announcements only for their own class',
          });
        }
      }
    }

    const payloadForCreate = {
      ...sanitized,
      ...(role === 'SUPER_ADMIN' ? { audienceType: 'SCHOOL', classId: null } : {}),
    };
    const createdAnnouncements = await Promise.all(
      targetSchoolIds.map((schoolId) => announcementService.createAnnouncement(payloadForCreate, schoolId, userId))
    );

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: createdAnnouncements.length === 1 ? createdAnnouncements[0] : createdAnnouncements,
      count: createdAnnouncements.length,
    });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: 'Failed to create announcement',
    });
  }
};

/**
 * @route   GET /api/announcements
 * @desc    Get announcements (role-based filtering)
 * @access  Authenticated users
 */
const getAnnouncements = async (req, res) => {
  try {
    const { schoolId: userSchoolId, role } = req.user;
    const { targetRole, isActive, schoolId: querySchoolId, classId } = req.query;
    const resolvedSchoolId = role === 'SUPER_ADMIN'
      ? (querySchoolId ? Number(querySchoolId) : null)
      : userSchoolId;

    let announcements;

    // Role-based visibility on GET /api/announcements
    if (role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN') {
      announcements = await announcementService.getAllAnnouncements(
        resolvedSchoolId,
        { targetRole, isActive, classId }
      );
    } else {
      // Otherwise, filter by role
      announcements = await announcementService.getAnnouncementsByRole(
        resolvedSchoolId,
        req.user
      );
    }

    // eslint-disable-next-line no-console
    console.log('announcements:', announcements);
    res.status(200).json({
      success: true,
      count: announcements.length,
      data: announcements,
    });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch announcements',
    });
  }
};

/**
 * @route   GET /api/announcements/:id
 * @desc    Get single announcement
 * @access  Authenticated users
 */
const getAnnouncementById = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId: userSchoolId, role } = req.user;
    const resolvedSchoolId = role === 'SUPER_ADMIN'
      ? (req.query.schoolId ? Number(req.query.schoolId) : null)
      : userSchoolId;

    const announcement = await announcementService.getAnnouncementById(
      parseInt(id),
      resolvedSchoolId
    );

    res.status(200).json({
      success: true,
      data: announcement,
    });
  } catch (error) {
    console.error('Get announcement error:', error);

    if (error.message === 'Announcement not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch announcement',
    });
  }
};

/**
 * @route   PUT /api/announcements/:id
 * @desc    Update announcement
 * @access  SCHOOL_ADMIN only
 */
const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId: userSchoolId, role, userId } = req.user;
    const data = req.body;
    const resolvedSchoolId = role === 'SUPER_ADMIN'
      ? Number(data.schoolId || req.query.schoolId)
      : userSchoolId;

    if (!resolvedSchoolId) {
      return res.status(400).json({
        success: false,
        error: 'schoolId is required',
      });
    }

    // Validate if data provided
    if (data.title || data.message || data.targetRole) {
      const errors = validateAnnouncementData({
        title: data.title || 'Valid Title',
        message: data.message || 'Valid Message',
        targetRole: data.targetRole || 'ALL',
        expiryDate: data.expiryDate,
      });

      if (errors.length > 0 && !errors.every(e => e.includes('required'))) {
        return res.status(400).json({
          success: false,
          error: errors.join(', '),
        });
      }
    }

    const sanitized = sanitizeAnnouncementData(data);

    const existing = await announcementService.getAnnouncementById(
      parseInt(id),
      resolvedSchoolId
    );
    if (isTeacherRole(role) && String(existing.createdBy) !== String(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Teachers can only update their own announcements',
      });
    }

    const announcement = await announcementService.updateAnnouncement(
      parseInt(id),
      sanitized,
      resolvedSchoolId
    );

    res.status(200).json({
      success: true,
      message: 'Announcement updated successfully',
      data: announcement,
    });
  } catch (error) {
    console.error('Update announcement error:', error);

    if (error.message === 'Announcement not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update announcement',
    });
  }
};

/**
 * @route   DELETE /api/announcements/:id
 * @desc    Delete announcement
 * @access  SCHOOL_ADMIN only
 */
const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId: userSchoolId, role, userId } = req.user;
    const resolvedSchoolId = role === 'SUPER_ADMIN'
      ? Number(req.query.schoolId)
      : userSchoolId;

    if (!resolvedSchoolId) {
      return res.status(400).json({
        success: false,
        error: 'schoolId is required',
      });
    }

    const existing = await announcementService.getAnnouncementById(
      parseInt(id),
      resolvedSchoolId
    );
    if (isTeacherRole(role) && String(existing.createdBy) !== String(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Teachers can only delete their own announcements',
      });
    }

    const result = await announcementService.deleteAnnouncement(
      parseInt(id),
      resolvedSchoolId
    );

    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully',
      data: result,
    });
  } catch (error) {
    console.error('Delete announcement error:', error);

    if (error.message === 'Announcement not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete announcement',
    });
  }
};

/**
 * @route   PATCH /api/announcements/:id/deactivate
 * @desc    Deactivate announcement
 * @access  SCHOOL_ADMIN only
 */
const deactivateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    const result = await announcementService.deactivateAnnouncement(
      parseInt(id),
      schoolId
    );

    res.status(200).json({
      success: true,
      message: 'Announcement deactivated successfully',
      data: result,
    });
  } catch (error) {
    console.error('Deactivate announcement error:', error);

    if (error.message === 'Announcement not found') {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to deactivate announcement',
    });
  }
};

/**
 * @route   GET /api/announcements/stats
 * @desc    Get announcement statistics
 * @access  SCHOOL_ADMIN only
 */
const getAnnouncementStats = async (req, res) => {
  try {
    const { schoolId } = req.user;

    const stats = await announcementService.getAnnouncementStats(schoolId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get announcement stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch announcement statistics',
    });
  }
};

module.exports = {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
  deactivateAnnouncement,
  getAnnouncementStats,
};