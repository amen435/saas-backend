// src/middleware/auth.middleware.js

const jwt = require('jsonwebtoken');
const { getAvailableRolesForUser } = require('../utils/role.utils');

/**
 * Authenticate JWT Token
 * Verifies token from Authorization header
 * Attaches decoded user data to req.user
 */
const authenticateToken = async (req, res, next) => {
  try {
    // ============================================
    // 1. GET TOKEN FROM HEADER
    // ============================================
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    // ============================================
    // 2. VERIFY TOKEN
    // ============================================
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'intelligeschool-api',
      audience: 'intelligeschool-client'
    });

    // ============================================
    // 3. ATTACH USER DATA TO REQUEST
    // ============================================
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      schoolId: decoded.schoolId,
      classId: decoded.classId
    };

    // ============================================
    // 4. DERIVE AVAILABLE ROLES & VALIDATE ACTIVE ROLE
    // ============================================
    const availableRoles = await getAvailableRolesForUser({
      userId: req.user.userId,
      role: req.user.role,
      schoolId: req.user.schoolId,
    });

    req.user.availableRoles = availableRoles;

    const headerRole = req.headers['x-active-role'];
    if (headerRole) {
      const activeRole = String(headerRole).trim().toUpperCase();

      if (!availableRoles.includes(activeRole)) {
        return res.status(403).json({
          success: false,
          error: 'Invalid active role for this user.',
        });
      }

      req.user.activeRole = activeRole;
    } else {
      // Fallback: use base role when no active role is provided
      req.user.activeRole = req.user.role;
    }

    next();

  } catch (error) {
    // Token expired
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please login again.'
      });
    }

    // Invalid token
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        success: false,
        error: 'Invalid token.'
      });
    }

    // Other errors
    console.error('Token verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Token verification failed.'
    });
  }
};

/**
 * Optional: Verify token and fetch fresh user data from database
 */
const authenticateTokenWithDB = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user data from database
    const prisma = require('../config/database');
    const user = await prisma.user.findUnique({
      where: { userId: decoded.userId },
      select: {
        userId: true,
        role: true,
        schoolId: true,
        classId: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'User not found or inactive.'
      });
    }

    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please login again.'
      });
    }

    return res.status(403).json({
      success: false,
      error: 'Invalid token.'
    });
  }
};

module.exports = {
  authenticateToken,
  authenticateTokenWithDB
};