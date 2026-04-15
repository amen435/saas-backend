const prisma = require('../config/database');

const STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
};

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function normalizeStatusInput(value, fallback = STATUS.ACTIVE) {
  if (typeof value === 'boolean') {
    return value ? STATUS.ACTIVE : STATUS.INACTIVE;
  }

  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === STATUS.ACTIVE || normalized === STATUS.INACTIVE) {
    return normalized;
  }

  return fallback;
}

function statusToActive(status) {
  return status === STATUS.ACTIVE;
}

function parseInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a valid positive integer.`);
  }
  return parsed;
}

function normalizeOptionalString(value) {
  if (value === undefined) return undefined;
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed : null;
}

function normalizeRequiredString(value, fieldName) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }
  return trimmed;
}

async function ensureSchoolClass(classId, schoolId) {
  const normalizedClassId = parseInteger(classId, 'classId');
  const classRecord = await prisma.class.findFirst({
    where: {
      classId: normalizedClassId,
      schoolId,
    },
    select: {
      classId: true,
      className: true,
      gradeLevel: true,
      section: true,
      academicYear: true,
      homeroomTeacherId: true,
      isActive: true,
    },
  });

  if (!classRecord) {
    throw new Error('Class not found in your school.');
  }

  return classRecord;
}

async function ensureUniqueUserIdentifiers({ userId, username, email, excludeUserId } = {}) {
  if (userId) {
    const existing = await prisma.user.findUnique({ where: { userId } });
    if (existing && existing.userId !== excludeUserId) {
      throw Object.assign(new Error('User ID already exists.'), { statusCode: 409 });
    }
  }

  if (username) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing && existing.userId !== excludeUserId) {
      throw Object.assign(new Error('Username already exists.'), { statusCode: 409 });
    }
  }

  if (email) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.userId !== excludeUserId) {
      throw Object.assign(new Error('Email already exists.'), { statusCode: 409 });
    }
  }
}

function buildListFilters(query = {}) {
  const where = {};
  const includeInactive = parseBoolean(query.includeInactive);
  const isActive = parseBoolean(query.isActive);
  if (isActive !== undefined) {
    where.isActive = isActive;
  } else if (includeInactive !== true) {
    where.isActive = true;
  }

  const status = String(query.status || '').trim().toUpperCase();
  if (status === STATUS.ACTIVE || status === STATUS.INACTIVE) {
    where.status = status;
  }

  return where;
}

module.exports = {
  STATUS,
  buildListFilters,
  ensureSchoolClass,
  ensureUniqueUserIdentifiers,
  normalizeOptionalString,
  normalizeRequiredString,
  normalizeStatusInput,
  parseBoolean,
  parseInteger,
  statusToActive,
};
