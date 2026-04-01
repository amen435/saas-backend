const prisma = require('../config/database');
const { Prisma } = require('@prisma/client');

const withAssetUrl = (req, value) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const normalizedPath = value.startsWith('/') ? value : `/${value}`;
  return `${req.protocol}://${req.get('host')}${normalizedPath}`;
};

const hasColumn = async (tableName, columnName) => {
  try {
    const rows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
          AND column_name = ${columnName}
        LIMIT 1
      `
    );

    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    console.error(`Column lookup failed for ${tableName}.${columnName}:`, error);
    return false;
  }
};

const getUserProfileImage = async (userId) => {
  const columnExists = await hasColumn('users', 'profileImage');
  if (!columnExists) {
    return null;
  }

  const rows = await prisma.$queryRawUnsafe(
    'SELECT "profileImage" FROM users WHERE "userId" = $1 LIMIT 1',
    String(userId)
  );

  return rows?.[0]?.profileImage || null;
};

const setUserProfileImage = async (userId, profileImage) => {
  const columnExists = await hasColumn('users', 'profileImage');
  if (!columnExists) {
    throw new Error('The profileImage column does not exist yet. Please run the latest database migration.');
  }

  await prisma.$executeRawUnsafe(
    'UPDATE users SET "profileImage" = $1, "updatedAt" = NOW() WHERE "userId" = $2',
    profileImage,
    String(userId)
  );
};

const getSchoolLogo = async (schoolId) => {
  if (!schoolId) return null;

  const columnExists = await hasColumn('schools', 'logo');
  if (!columnExists) {
    return null;
  }

  const rows = await prisma.$queryRawUnsafe(
    'SELECT logo FROM schools WHERE "schoolId" = $1 LIMIT 1',
    Number(schoolId)
  );

  return rows?.[0]?.logo || null;
};

const setSchoolLogo = async (schoolId, logo) => {
  const columnExists = await hasColumn('schools', 'logo');
  if (!columnExists) {
    throw new Error('The school logo column does not exist yet. Please run the latest database migration.');
  }

  await prisma.$executeRawUnsafe(
    'UPDATE schools SET logo = $1, "updatedAt" = NOW() WHERE "schoolId" = $2',
    logo,
    Number(schoolId)
  );
};

module.exports = {
  withAssetUrl,
  hasColumn,
  getUserProfileImage,
  setUserProfileImage,
  getSchoolLogo,
  setSchoolLogo,
};
