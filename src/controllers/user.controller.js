// src/controllers/user.controller.js

const bcrypt = require('bcrypt');
const prisma = require('../config/database');
const { getAvailableRolesForUser } = require('../utils/role.utils');
const { validatePasswordStrength } = require('../utils/password.utils');

/**
 * @route   POST /api/users/school-admins
 * @desc    Create a new school admin
 * @access  Private (SUPER_ADMIN only)
 */
const createSchoolAdmin = async (req, res) => {
  try {
    const {
      userId,
      username,
      email,
      password,
      fullName,
      phone,
      schoolId
    } = req.body;

    // ============================================
    // 1. VALIDATION
    // ============================================
    
    // Required fields
    if (!userId || !username || !password || !fullName || !schoolId) {
      return res.status(400).json({
        success: false,
        error: 'userId, username, password, fullName, and schoolId are required'
      });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        error: passwordError
      });
    }

    // ============================================
    // 2. CHECK IF SCHOOL EXISTS
    // ============================================
    
    const school = await prisma.school.findUnique({
      where: { schoolId: parseInt(schoolId) }
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        error: 'School not found'
      });
    }

    if (!school.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Cannot create admin for inactive school'
      });
    }

    // ============================================
    // 3. CHECK FOR DUPLICATE USERNAME
    // ============================================
    
    const existingUsername = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUsername) {
      return res.status(409).json({
        success: false,
        error: 'Username already exists'
      });
    }

    // ============================================
    // 4. CHECK FOR DUPLICATE EMAIL (if provided)
    // ============================================
    
    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email }
      });

      if (existingEmail) {
        return res.status(409).json({
          success: false,
          error: 'Email already exists'
        });
      }
    }

    // ============================================
    // 5. CHECK FOR DUPLICATE USER ID
    // ============================================
    
    const existingUserId = await prisma.user.findUnique({
      where: { userId }
    });

    if (existingUserId) {
      return res.status(409).json({
        success: false,
        error: 'User ID already exists'
      });
    }

    // ============================================
    // 6. HASH PASSWORD
    // ============================================
    
    const passwordHash = await bcrypt.hash(password, 10);

    // ============================================
    // 7. CREATE SCHOOL ADMIN
    // ============================================
    
    const schoolAdmin = await prisma.user.create({
      data: {
        userId,
        username,
        email: email || null,
        passwordHash,
        role: 'SCHOOL_ADMIN', // Automatically set
        schoolId: parseInt(schoolId),
        fullName,
        phone: phone || null,
        isActive: true, // Default
        failedAttempts: 0, // Default
        lockedUntil: null // Default
      },
      include: {
        school: {
          select: {
            schoolId: true,
            schoolCode: true,
            schoolName: true
          }
        }
      }
    });

    // ============================================
    // 8. RETURN SUCCESS (DON'T SEND PASSWORD!)
    // ============================================
    
    res.status(201).json({
      success: true,
      message: 'School admin created successfully',
      data: {
        userId: schoolAdmin.userId,
        username: schoolAdmin.username,
        email: schoolAdmin.email,
        fullName: schoolAdmin.fullName,
        phone: schoolAdmin.phone,
        role: schoolAdmin.role,
        school: schoolAdmin.school,
        isActive: schoolAdmin.isActive,
        createdAt: schoolAdmin.createdAt
      }
    });

  } catch (error) {
    console.error('Create school admin error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create school admin'
    });
  }
};

/**
 * @route   GET /api/users/school-admins
 * @desc    Get all school admins
 * @access  Private (SUPER_ADMIN only)
 */
const getAllSchoolAdmins = async (req, res) => {
  try {
    const { schoolId, isActive } = req.query;

    // Build where clause
    const where = {
      role: 'SCHOOL_ADMIN'
    };

    // Filter by school
    if (schoolId) {
      where.schoolId = parseInt(schoolId);
    }

    // Filter by active status
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const schoolAdmins = await prisma.user.findMany({
      where,
      select: {
        userId: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        schoolId: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        school: {
          select: {
            schoolId: true,
            schoolCode: true,
            schoolName: true,
            city: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json({
      success: true,
      count: schoolAdmins.length,
      data: schoolAdmins
    });

  } catch (error) {
    console.error('Get school admins error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch school admins'
    });
  }
};

/**
 * @route   GET /api/users/school-admins/:userId
 * @desc    Get single school admin by userId
 * @access  Private (SUPER_ADMIN only)
 */
const getSchoolAdminById = async (req, res) => {
  try {
    const { userId } = req.params;

    const schoolAdmin = await prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        schoolId: true,
        isActive: true,
        failedAttempts: true,
        lockedUntil: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        school: {
          select: {
            schoolId: true,
            schoolCode: true,
            schoolName: true,
            city: true,
            isActive: true
          }
        }
      }
    });

    if (!schoolAdmin) {
      return res.status(404).json({
        success: false,
        error: 'School admin not found'
      });
    }

    if (schoolAdmin.role !== 'SCHOOL_ADMIN') {
      return res.status(400).json({
        success: false,
        error: 'User is not a school admin'
      });
    }

    res.status(200).json({
      success: true,
      data: schoolAdmin
    });

  } catch (error) {
    console.error('Get school admin error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch school admin'
    });
  }
};

/**
 * @route   PATCH /api/users/school-admins/:userId/activate
 * @desc    Activate school admin
 * @access  Private (SUPER_ADMIN only)
 */
const activateSchoolAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'SCHOOL_ADMIN') {
      return res.status(400).json({
        success: false,
        error: 'User is not a school admin'
      });
    }

    const updatedAdmin = await prisma.user.update({
      where: { userId },
      data: {
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null
      }
    });

    res.status(200).json({
      success: true,
      message: 'School admin activated successfully',
      data: {
        userId: updatedAdmin.userId,
        username: updatedAdmin.username,
        isActive: updatedAdmin.isActive
      }
    });

  } catch (error) {
    console.error('Activate school admin error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate school admin'
    });
  }
};

/**
 * @route   PATCH /api/users/school-admins/:userId/deactivate
 * @desc    Deactivate school admin
 * @access  Private (SUPER_ADMIN only)
 */
const deactivateSchoolAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'SCHOOL_ADMIN') {
      return res.status(400).json({
        success: false,
        error: 'User is not a school admin'
      });
    }

    const updatedAdmin = await prisma.user.update({
      where: { userId },
      data: { isActive: false }
    });

    res.status(200).json({
      success: true,
      message: 'School admin deactivated successfully',
      data: {
        userId: updatedAdmin.userId,
        username: updatedAdmin.username,
        isActive: updatedAdmin.isActive
      }
    });

  } catch (error) {
    console.error('Deactivate school admin error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate school admin'
    });
  }
};

/**
 * @route   GET /api/users/me
 * @desc    Get current user's available roles (including dynamic homeroom role)
 * @access  Authenticated users (multi-tenant via schoolId)
 */
const getCurrentUserRoles = async (req, res) => {
  try {
    const { userId, role, schoolId } = req.user || {};

    if (!userId || !role) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    const roles = await getAvailableRolesForUser({ userId, role, schoolId });

    return res.status(200).json({
      success: true,
      data: {
        userId,
        roles,
      },
    });
  } catch (error) {
    console.error('Get current user roles error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch current user roles',
    });
  }
};

module.exports = {
  createSchoolAdmin,
  getAllSchoolAdmins,
  getSchoolAdminById,
  activateSchoolAdmin,
  deactivateSchoolAdmin,
  getCurrentUserRoles,
};
