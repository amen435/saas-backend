// src/controllers/auth.controller.js

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { getAvailableRolesForUser } = require('../utils/role.utils');
const {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  parseCookies,
  serializeCookie,
  getCookieOptions,
  generateCsrfToken,
} = require('../utils/security.utils');

const resolveUserClassId = (user) =>
  user?.student?.classId != null ? user.student.classId : null;

const buildUserPayload = async (user) => {
  const roles = await getAvailableRolesForUser({
    userId: user.userId,
    role: user.role,
    schoolId: user.schoolId,
  });

  return {
    userId: user.userId,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
    schoolCode: user.school?.schoolCode || null,
    schoolName: user.school?.schoolName || null,
    classId: resolveUserClassId(user),
    roles,
  };
};

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
        },
        student: { select: { classId: true } },
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
    let passwordMatch = false;
    try {
      passwordMatch = await bcrypt.compare(password, user.passwordHash || '');
    } catch (bcryptErr) {
      // Non-bcrypt or corrupted passwordHash throws — avoid 500; log for admins
      console.error('Login bcrypt error (check users.passwordHash):', bcryptErr?.message || bcryptErr);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    if (!passwordMatch) {
      // Increment failed attempts
      const prevAttempts = Number(user.failedAttempts);
      const safeAttempts = Number.isFinite(prevAttempts) ? prevAttempts : 0;
      const newFailedAttempts = safeAttempts + 1;
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
      classId: resolveUserClassId(user),
    };

    const expiresIn = String(process.env.JWT_EXPIRY || '1d').trim() || '1d';
    let token;
    try {
      token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
        expiresIn,
        issuer: 'intelligeschool-api',
        audience: 'intelligeschool-client',
      });
    } catch (jwtErr) {
      console.error('Login JWT sign error:', jwtErr?.message || jwtErr);
      return res.status(500).json({
        success: false,
        error: 'Login service misconfigured. Check JWT_SECRET and JWT_EXPIRY.',
      });
    }

    const csrfToken = generateCsrfToken();
    const cookieOptions = getCookieOptions();
    // JWT and hex CSRF are cookie-safe; avoid encodeURIComponent (breaks '=' in JWT, inflates size).
    res.setHeader('Set-Cookie', [
      serializeCookie(AUTH_COOKIE_NAME, token, { ...cookieOptions.auth, encodeValue: false }),
      serializeCookie(CSRF_COOKIE_NAME, csrfToken, { ...cookieOptions.csrf, encodeValue: false }),
    ]);

    // ============================================
    // 11. RETURN SUCCESS RESPONSE
    // ============================================
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          userId: user.userId,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          schoolId: user.schoolId,
          schoolCode: user.school?.schoolCode || null,
          schoolName: user.school?.schoolName || null,
          classId: resolveUserClassId(user),
          roles: rolesArray,
        },
        // Lets SPA on another origin (e.g. localhost) send X-CSRF-Token; that host cannot read csrf_token cookie.
        csrfToken,
      },
    });

  } catch (error) {
    console.error('Login error:', error);
    const isProd = (process.env.NODE_ENV || 'development') === 'production';
    const msg = String(error?.message || '');
    const isDbUnreachable =
      error?.code === 'P1001' ||
      error?.name === 'PrismaClientInitializationError' ||
      msg.includes("Can't reach database server");

    if (isDbUnreachable) {
      return res.status(503).json({
        success: false,
        error:
          'Cannot connect to the database. In saas-backend/.env set DATABASE_URL to your PostgreSQL server (e.g. localhost, not the placeholder hostname "host") and ensure Postgres is running.',
        ...(!isProd ? { debug: msg } : {}),
      });
    }

    res.status(500).json({
      success: false,
      error: 'An error occurred during login. Please try again.',
      ...(!isProd && msg ? { debug: msg } : {}),
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
    const user = await prisma.user.findUnique({
      where: { userId: String(req.user.userId) },
      include: {
        school: {
          select: {
            schoolCode: true,
            schoolName: true,
          },
        },
        student: { select: { classId: true } },
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Session is no longer valid',
      });
    }

    const payload = await buildUserPayload(user);

    const cookies = parseCookies(req.headers.cookie || '');
    const csrfFromCookie = cookies[CSRF_COOKIE_NAME] || null;

    res.status(200).json({
      success: true,
      message: 'Token is valid',
      data: {
        user: payload,
        ...(csrfFromCookie ? { csrfToken: csrfFromCookie } : {}),
      },
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
    const cookieOptions = getCookieOptions();
    res.setHeader('Set-Cookie', [
      serializeCookie(AUTH_COOKIE_NAME, '', { ...cookieOptions.auth, maxAge: 0, encodeValue: false }),
      serializeCookie(CSRF_COOKIE_NAME, '', { ...cookieOptions.csrf, maxAge: 0, encodeValue: false }),
    ]);
    
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
