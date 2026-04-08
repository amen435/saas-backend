const prisma = require('../config/database');
const {
  getUserProfileImage,
  getSchoolLogo,
  setUserProfileImage,
  withAssetUrl,
} = require('../utils/branding.utils');

const getProfile = async (req, res) => {
  try {
    const { userId } = req.user;

    const user = await prisma.user.findUnique({
      where: { userId: String(userId) },
      select: {
        userId: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        schoolId: true,
        isActive: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found.',
      });
    }

    const [profileImage, schoolBase, schoolLogo] = await Promise.all([
      getUserProfileImage(user.userId),
      user.schoolId
        ? prisma.school.findUnique({
            where: { schoolId: Number(user.schoolId) },
            select: {
              schoolId: true,
              schoolCode: true,
              schoolName: true,
            },
          })
        : Promise.resolve(null),
      user.schoolId ? getSchoolLogo(user.schoolId) : Promise.resolve(null),
    ]);

    const school = schoolBase
      ? {
          ...schoolBase,
          logo: withAssetUrl(req, schoolLogo),
        }
      : null;

    return res.status(200).json({
      success: true,
      data: {
        ...user,
        profileImage: withAssetUrl(req, profileImage),
        school,
        schoolName: school?.schoolName || null,
      },
    });
  } catch (error) {
    console.error('Get profile summary error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch profile.',
    });
  }
};

const updateProfilePhoto = async (req, res) => {
  try {
    const { userId } = req.user;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Profile photo file is required.',
      });
    }

    const relativePath = `/uploads/profile-images/${req.file.filename}`;
    await setUserProfileImage(userId, relativePath);

    return res.status(200).json({
      success: true,
      message: 'Profile photo updated successfully.',
      data: {
        profileImage: withAssetUrl(req, relativePath),
      },
    });
  } catch (error) {
    console.error('Update profile photo error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update profile photo.',
    });
  }
};

module.exports = {
  getProfile,
  updateProfilePhoto,
};
