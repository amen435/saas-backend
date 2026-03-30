// src/controllers/auth.controller.js

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { getAvailableRolesForUser } = require('../utils/role.utils');

/**
 * @route   POST /api/auth/login
 * @desc    Login user with username/userId and password
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { username, password, schoolId } = req.body;
    const normalizedSchoolInput = (schoolId || '').toString().trim();

    // ============================================
    // 1. VALIDATION
    // ============================================
    if (!username || !password || !normalizedSchoolInput) {
      return res.status(400).json({
        success: false,
        error: 'Username, schoolId, and password are required'
      });
    }

    // ============================================
    // 2. FIND USER (by username OR userId)
    // ============================================
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username },
          { userId: username }  // Allow login with userId
        ],
        isActive: true  // Only active users can login
      },
      include: {
        school: {
          select: {
            schoolId: true,
            schoolCode: true,
            schoolName: true,
            isActive: true
          }
        }
      }
    });

    // ============================================
    // 3. CHECK USER EXISTS
    // ============================================
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'  // Generic error (security)
      });
    }

    // ============================================
    // 4. CHECK ACCOUNT LOCK
    // ============================================
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.lockedUntil) - new Date()) / 1000 / 60
      );
      return res.status(423).json({
        success: false,
        error: `Account locked. Try again in ${lockTimeRemaining} minutes.`
      });
    }

    // ============================================
    // 5. VERIFY PASSWORD
    // ============================================
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      // Increment failed attempts
      const newFailedAttempts = user.failedAttempts + 1;
      let lockedUntil = null;

      // Lock account after 5 failed attempts (30 minutes)
      if (newFailedAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      }

      await prisma.user.update({
        where: { userId: user.userId },
        data: {
          failedAttempts: newFailedAttempts,
          lockedUntil: lockedUntil
        }
      });

      if (lockedUntil) {
        return res.status(423).json({
          success: false,
          error: 'Too many failed attempts. Account locked for 30 minutes.'
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'  // Generic error (security)
      });
    }

    // ============================================
    // 6. CHECK SCHOOL MATCH (for non-super-admin)
    // ============================================
    if (user.role !== 'SUPER_ADMIN') {
      const userSchoolId = user.schoolId !== null && user.schoolId !== undefined
        ? String(user.schoolId)
        : null;
      const userSchoolCode = user.school?.schoolCode
        ? String(user.school.schoolCode).toLowerCase()
        : null;
      const inputLower = normalizedSchoolInput.toLowerCase();
      const schoolMatches = normalizedSchoolInput === userSchoolId || inputLower === userSchoolCode;

      if (!schoolMatches) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }
    }

    // ============================================
    // 7. CHECK SCHOOL ACTIVE (if not Super Admin)
    // ============================================
    if (user.role !== 'SUPER_ADMIN') {
      if (!user.school || !user.school.isActive) {
        return res.status(403).json({
          success: false,
          error: 'School is inactive. Contact administrator.'
        });
      }
    }

    // ============================================
    // 8. SUCCESSFUL LOGIN - RESET FAILED ATTEMPTS
    // ============================================
    await prisma.user.update({
      where: { userId: user.userId },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLogin: new Date()
      }
    });

    // ============================================
    // 9. DERIVE AVAILABLE ROLES (including homeroom)
    // ============================================
    const rolesArray = await getAvailableRolesForUser({
      userId: user.userId,
      role: user.role,
      schoolId: user.schoolId,
    });

    // ============================================
    // 10. GENERATE JWT TOKEN (base role only)
    // ============================================
    const tokenPayload = {
      userId: user.userId,
      role: user.role,
      schoolId: user.schoolId,
      classId: user.classId
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRY || '1d',
        issuer: 'intelligeschool-api',
        audience: 'intelligeschool-client'
      }
    );

    // ============================================
    // 11. RETURN SUCCESS RESPONSE
    // ============================================
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          userId: user.userId,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          schoolId: user.schoolId,
          schoolCode: user.school?.schoolCode || null,
          schoolName: user.school?.schoolName || null,
          classId: user.classId,
          roles: rolesArray,
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred during login. Please try again.'
    });
  }
};

/**
 * @route   GET /api/auth/verify
 * @desc    Verify JWT token validity
 * @access  Private
 */
const verifyToken = async (req, res) => {
  try {
    // Token already verified by auth middleware
    // req.user contains decoded token data
    
    res.status(200).json({
      success: true,
      message: 'Token is valid',
      data: {
        userId: req.user.userId,
        role: req.user.role,
        schoolId: req.user.schoolId,
        classId: req.user.classId
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Token verification failed'
    });
  }
};

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
const logout = async (req, res) => {
  try {
    // In stateless JWT, logout is handled client-side
    // Optional: Implement token blacklist here if needed
    
    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
};

module.exports = {
  login,
  verifyToken,
  logout
};
