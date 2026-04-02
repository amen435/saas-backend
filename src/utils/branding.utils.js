const prisma = require('../config/database');

const withAssetUrl = (req, value) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const baseUrl = String(process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  const normalizedPath = value.startsWith('/') ? value : `/${value}`;

  if (baseUrl) {
    return `${baseUrl}${normalizedPath}`;
  }

  return `${req.protocol}://${req.get('host')}${normalizedPath}`;
};

const getUserProfileImage = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { userId: String(userId) },
    select: { profileImage: true },
  });

  return user?.profileImage || null;
};

const setUserProfileImage = async (userId, profileImage) => {
  await prisma.user.update({
    where: { userId: String(userId) },
    data: { profileImage },
  });
};

const getSchoolLogo = async (schoolId) => {
  if (!schoolId) return null;

  const school = await prisma.school.findUnique({
    where: { schoolId: Number(schoolId) },
    select: { logo: true },
  });

  return school?.logo || null;
};

const setSchoolLogo = async (schoolId, logo) => {
  await prisma.school.update({
    where: { schoolId: Number(schoolId) },
    data: { logo },
  });
};

module.exports = {
  withAssetUrl,
  getUserProfileImage,
  setUserProfileImage,
  getSchoolLogo,
  setSchoolLogo,
};
