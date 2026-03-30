// src/utils/announcementValidation.js

/** Prisma / API canonical target roles */
const CANONICAL_TARGET_ROLES = ['ALL', 'TEACHERS', 'STUDENTS', 'PARENTS', 'SCHOOL_ADMIN'];

/**
 * Map API aliases (TEACHER, STUDENT, PARENT) to Prisma enum values.
 */
const normalizeTargetRole = (input) => {
  if (input === undefined || input === null || input === '') return 'ALL';
  const s = String(input).toUpperCase().trim();
  const map = {
    TEACHER: 'TEACHERS',
    TEACHERS: 'TEACHERS',
    STUDENT: 'STUDENTS',
    STUDENTS: 'STUDENTS',
    PARENT: 'PARENTS',
    PARENTS: 'PARENTS',
    ALL: 'ALL',
    SCHOOL_ADMIN: 'SCHOOL_ADMIN',
  };
  return map[s] || (CANONICAL_TARGET_ROLES.includes(s) ? s : 'ALL');
};

/**
 * Validate announcement data
 */
const validateAnnouncementData = (data) => {
  const errors = [];

  if (!data.title || data.title.trim() === '') {
    errors.push('Title is required');
  }

  if (data.title && data.title.length > 200) {
    errors.push('Title must be less than 200 characters');
  }

  if (!data.message || data.message.trim() === '') {
    errors.push('Message is required');
  }

  if (data.message && data.message.length > 5000) {
    errors.push('Message must be less than 5000 characters');
  }

  if (data.targetRole !== undefined && data.targetRole !== null && data.targetRole !== '') {
    const n = normalizeTargetRole(data.targetRole);
    if (!CANONICAL_TARGET_ROLES.includes(n)) {
      errors.push('Target role must be ALL, TEACHERS, STUDENTS, PARENTS, or SCHOOL_ADMIN');
    }
  }

  if (data.expiryDate) {
    const expiryDate = new Date(data.expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expiryDate < today) {
      errors.push('Expiry date cannot be in the past');
    }
  }

  const audienceType = data.audienceType || 'SCHOOL';
  if (!['SCHOOL', 'CLASS'].includes(audienceType)) {
    errors.push('audienceType must be SCHOOL or CLASS');
  }
  if (audienceType === 'CLASS' && !data.classId) {
    errors.push('classId is required when audienceType is CLASS');
  }

  return errors;
};

/**
 * Sanitize announcement data
 */
const sanitizeAnnouncementData = (data) => {
  const audienceType = data.audienceType || 'SCHOOL';
  return {
    title: data.title?.trim(),
    message: data.message?.trim(),
    targetRole: normalizeTargetRole(data.targetRole),
    expiryDate: data.expiryDate || null,
    audienceType,
    classId: audienceType === 'CLASS' && data.classId ? Number(data.classId) : null,
  };
};

/**
 * Check if announcement is expired
 */
const isExpired = (expiryDate) => {
  if (!expiryDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  return expiry < today;
};

module.exports = {
  validateAnnouncementData,
  sanitizeAnnouncementData,
  isExpired,
  normalizeTargetRole,
  CANONICAL_TARGET_ROLES,
};
