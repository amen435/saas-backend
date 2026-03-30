const bcrypt = require('bcrypt');
const prisma = require('../config/database');
const { getSchoolLogo, setSchoolLogo, withAssetUrl } = require('../utils/branding.utils');

const canAccessSchool = (req, schoolId) => {
  const effectiveRole = req.user?.activeRole || req.user?.role;
  if (effectiveRole === 'SUPER_ADMIN') {
    return true;
  }

  return Number(req.user?.schoolId) === Number(schoolId);
};

const decorateSchool = async (req, school) => {
  if (!school) return school;

  const logo = await getSchoolLogo(school.schoolId);
  return {
    ...school,
    logo: withAssetUrl(req, logo),
  };
};

const createSchool = async (req, res) => {
  try {
    const {
      schoolCode,
      schoolName,
      address,
      city,
      country,
      expiryDate,
      adminUserId,
      adminUsername,
      adminPassword,
      adminFullName,
      adminEmail,
      adminPhone,
    } = req.body;

    if (!schoolCode || !schoolName) {
      return res.status(400).json({
        success: false,
        error: 'School code and name are required',
      });
    }

    const existingSchool = await prisma.school.findUnique({
      where: { schoolCode },
    });

    if (existingSchool) {
      return res.status(409).json({
        success: false,
        error: 'School code already exists',
      });
    }

    const createAdmin =
      adminUserId &&
      adminUsername &&
      adminPassword &&
      adminFullName;

    if (createAdmin) {
      if (adminPassword.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'Admin password must be at least 8 characters long',
        });
      }

      const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/;
      if (!passwordRegex.test(adminPassword)) {
        return res.status(400).json({
          success: false,
          error: 'Admin password must contain at least one uppercase letter, one number, and one special character',
        });
      }

      const existingUsername = await prisma.user.findUnique({
        where: { username: adminUsername },
      });
      if (existingUsername) {
        return res.status(409).json({
          success: false,
          error: 'Admin username already exists',
        });
      }

      const existingUserId = await prisma.user.findUnique({
        where: { userId: adminUserId },
      });
      if (existingUserId) {
        return res.status(409).json({
          success: false,
          error: 'Admin user ID already exists',
        });
      }

      if (adminEmail) {
        const existingEmail = await prisma.user.findUnique({
          where: { email: adminEmail },
        });
        if (existingEmail) {
          return res.status(409).json({
            success: false,
            error: 'Admin email already exists',
          });
        }
      }
    }

    const school = await prisma.$transaction(async (tx) => {
      const newSchool = await tx.school.create({
        data: {
          schoolCode,
          schoolName,
          address: address || null,
          city: city || null,
          country: country || 'Ethiopia',
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          isActive: true,
        },
      });

      if (createAdmin) {
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        await tx.user.create({
          data: {
            userId: adminUserId,
            username: adminUsername,
            email: adminEmail || null,
            passwordHash,
            role: 'SCHOOL_ADMIN',
            schoolId: newSchool.schoolId,
            fullName: adminFullName,
            phone: adminPhone || null,
            isActive: true,
            failedAttempts: 0,
            lockedUntil: null,
          },
        });
      }

      return newSchool;
    });

    res.status(201).json({
      success: true,
      message: createAdmin
        ? 'School and School Admin created successfully'
        : 'School created successfully',
      data: school,
    });
  } catch (error) {
    console.error('Create school error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create school',
    });
  }
};

const getAllSchools = async (req, res) => {
  try {
    const { isActive, city, search } = req.query;
    const where = {};

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (city) {
      where.city = city;
    }

    if (search) {
      where.OR = [
        { schoolName: { contains: search } },
        { schoolCode: { contains: search } },
      ];
    }

    const schools = await prisma.school.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
          select: {
            users: true,
          },
        },
      },
    });

    const now = new Date();
    for (const school of schools) {
      if (school.expiryDate && school.expiryDate < now && school.isActive) {
        await prisma.school.update({
          where: { schoolId: school.schoolId },
          data: { isActive: false },
        });
        school.isActive = false;
      }
    }

    const decoratedSchools = await Promise.all(schools.map((school) => decorateSchool(req, school)));

    res.status(200).json({
      success: true,
      count: decoratedSchools.length,
      data: decoratedSchools,
    });
  } catch (error) {
    console.error('Get schools error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch schools',
    });
  }
};

const getSchoolById = async (req, res) => {
  try {
    const numericSchoolId = parseInt(req.params.schoolId, 10);

    if (!canAccessSchool(req, numericSchoolId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only access your own school data.',
      });
    }

    const school = await prisma.school.findUnique({
      where: { schoolId: numericSchoolId },
      include: {
        _count: {
          select: {
            users: true,
            classes: true,
          },
        },
      },
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found',
      });
    }

    const now = new Date();
    if (school.expiryDate && school.expiryDate < now && school.isActive) {
      await prisma.school.update({
        where: { schoolId: school.schoolId },
        data: { isActive: false },
      });
      school.isActive = false;
    }

    const decoratedSchool = await decorateSchool(req, school);

    res.status(200).json({
      success: true,
      data: decoratedSchool,
    });
  } catch (error) {
    console.error('Get school error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch school',
    });
  }
};

const updateSchool = async (req, res) => {
  try {
    const numericSchoolId = parseInt(req.params.schoolId, 10);
    const { schoolName, address, city, country, expiryDate } = req.body;

    if (!canAccessSchool(req, numericSchoolId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only update your own school.',
      });
    }

    const school = await prisma.school.findUnique({
      where: { schoolId: numericSchoolId },
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found',
      });
    }

    const updatedSchool = await prisma.school.update({
      where: { schoolId: numericSchoolId },
      data: {
        schoolName: schoolName || school.schoolName,
        address: address !== undefined ? address : school.address,
        city: city !== undefined ? city : school.city,
        country: country || school.country,
        expiryDate: expiryDate ? new Date(expiryDate) : school.expiryDate,
      },
    });

    const decoratedSchool = await decorateSchool(req, updatedSchool);

    res.status(200).json({
      success: true,
      message: 'School updated successfully',
      data: decoratedSchool,
    });
  } catch (error) {
    console.error('Update school error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update school',
    });
  }
};

const updateSchoolLogo = async (req, res) => {
  try {
    const numericSchoolId = parseInt(req.params.schoolId, 10);

    if (!canAccessSchool(req, numericSchoolId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only update your own school logo.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'School logo file is required.',
      });
    }

    const school = await prisma.school.findUnique({
      where: { schoolId: numericSchoolId },
      select: {
        schoolId: true,
        schoolCode: true,
        schoolName: true,
      },
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found',
      });
    }

    const relativePath = `/uploads/school-logos/${req.file.filename}`;
    await setSchoolLogo(numericSchoolId, relativePath);

    res.status(200).json({
      success: true,
      message: 'School logo updated successfully',
      data: {
        ...school,
        logo: withAssetUrl(req, relativePath),
      },
    });
  } catch (error) {
    console.error('Update school logo error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update school logo',
    });
  }
};

const activateSchool = async (req, res) => {
  try {
    const numericSchoolId = parseInt(req.params.schoolId, 10);

    const school = await prisma.school.findUnique({
      where: { schoolId: numericSchoolId },
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found',
      });
    }

    const now = new Date();
    if (school.expiryDate && school.expiryDate < now) {
      return res.status(400).json({
        success: false,
        error: 'Cannot activate expired school. Please update expiry date first.',
      });
    }

    const updatedSchool = await prisma.school.update({
      where: { schoolId: numericSchoolId },
      data: { isActive: true },
    });

    res.status(200).json({
      success: true,
      message: 'School activated successfully',
      data: updatedSchool,
    });
  } catch (error) {
    console.error('Activate school error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate school',
    });
  }
};

const deactivateSchool = async (req, res) => {
  try {
    const numericSchoolId = parseInt(req.params.schoolId, 10);

    const school = await prisma.school.findUnique({
      where: { schoolId: numericSchoolId },
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found',
      });
    }

    const updatedSchool = await prisma.school.update({
      where: { schoolId: numericSchoolId },
      data: { isActive: false },
    });

    res.status(200).json({
      success: true,
      message: 'School deactivated successfully',
      data: updatedSchool,
    });
  } catch (error) {
    console.error('Deactivate school error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate school',
    });
  }
};

const checkExpiredSchools = async (req, res) => {
  try {
    const now = new Date();

    const expiredSchools = await prisma.school.findMany({
      where: {
        isActive: true,
        expiryDate: {
          lt: now,
        },
      },
    });

    const deactivatedCount = expiredSchools.length;

    for (const school of expiredSchools) {
      await prisma.school.update({
        where: { schoolId: school.schoolId },
        data: { isActive: false },
      });
    }

    res.status(200).json({
      success: true,
      message: `${deactivatedCount} expired school(s) deactivated`,
      data: {
        deactivatedCount,
        schools: expiredSchools.map((school) => ({
          schoolId: school.schoolId,
          schoolName: school.schoolName,
          expiryDate: school.expiryDate,
        })),
      },
    });
  } catch (error) {
    console.error('Check expiry error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check expired schools',
    });
  }
};

module.exports = {
  createSchool,
  getAllSchools,
  getSchoolById,
  updateSchool,
  updateSchoolLogo,
  activateSchool,
  deactivateSchool,
  checkExpiredSchools,
};
