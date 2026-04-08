// src/middleware/auth.middleware.js

const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { getAvailableRolesForUser } = require('../utils/role.utils');
const {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  parseCookies,
} = require('../utils/security.utils');

/**
 * Authenticate JWT from HttpOnly cookie.
 * Backend is the source of truth for identity and role.
 */

const authenticateToken = async (req, res, next) => {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const cookieToken = cookies[AUTH_COOKIE_NAME] ? String(cookies[AUTH_COOKIE_NAME]).trim() : null;
    const token = cookieToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'intelligeschool-api',
      audience: 'intelligeschool-client',
      clockTolerance: 30,
    });

    const user = await prisma.user.findUnique({
      where: { userId: String(decoded.userId) },
      select: {
        userId: true,
        role: true,
        schoolId: true,
        isActive: true,
        student: { select: { classId: true } },
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Session is no longer valid.'
      });
    }

    req.user = {
      userId: user.userId,
      role: user.role,
      schoolId: user.schoolId,
      classId: user.student?.classId ?? null,
      activeRole: user.role,
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
  return authenticateToken(req, res, next);
};

const requireCsrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookies = parseCookies(req.headers.cookie || '');
  const cookieToken = cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      success: false,
      error: 'Invalid CSRF token.'
    });
  }

  return next();
};

module.exports = {
  authenticateToken,
  authenticateTokenWithDB,
  requireCsrfProtection
};
