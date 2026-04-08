// src/middleware/rbac.middleware.js

/**
 * Role-Based Access Control Middleware
 * Checks if user has required role(s)
 */
const { writeAudit } = require('../utils/auditLogger');

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.user || !req.user.role) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required.'
        });
      }

      // Convert single role to array
      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

      // Role is resolved server-side from verified session.
      const effectiveRole = req.user.activeRole || req.user.role;

      // Check if user's effective role is allowed
      if (!roles.includes(effectiveRole)) {
        writeAudit('auth.forbidden_role', {
          userId: req.user.userId,
          role: effectiveRole,
          requiredRoles: roles,
          path: req.originalUrl,
          method: req.method,
          ip: req.ip,
        });
        return res.status(403).json({
          success: false,
          error: 'Access denied. Insufficient permissions.'
        });
      }

      next();

    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Permission verification failed.'
      });
    }
  };
};

/**
 * Permission middleware using a static role->permissions map.
 * This keeps handlers explicit while remaining backward compatible.
 */
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  SCHOOL_ADMIN: ['users:read', 'users:write', 'school:manage', 'system:admin', 'messages:read', 'messages:write'],
  HOMEROOM_TEACHER: [
    'attendance:read',
    'attendance:write',
    'attendance:write:assigned',
    'grades:read',
    'grades:write',
    'grades:write:assigned',
    'messages:read',
    'messages:write',
  ],
  TEACHER: [
    'attendance:read',
    'attendance:write',
    'attendance:write:assigned',
    'grades:read',
    'grades:write',
    'grades:write:assigned',
    'messages:read',
    'messages:write',
  ],
  STUDENT: ['attendance:read:self', 'grades:read:self', 'messages:read', 'messages:write'],
  PARENT: ['attendance:read:child', 'grades:read:child', 'messages:read', 'messages:write'],
};

function userHasPermission(req, permission) {
  const role = String(req.user?.activeRole || req.user?.role || '').toUpperCase();
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

const requirePermission = (permission) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required.',
        });
      }

      if (userHasPermission(req, permission)) {
        return next();
      }

      return res.status(403).json({
        success: false,
        error: 'Access denied. Missing required permission.',
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Permission verification failed.',
      });
    }
  };
};

const requireAnyPermission = (permissions) => {
  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required.',
        });
      }

      const allowed = requiredPermissions.some((permission) => userHasPermission(req, permission));
      if (allowed) {
        return next();
      }

      writeAudit('auth.forbidden_permission', {
        userId: req.user.userId,
        role: String(req.user.activeRole || req.user.role || '').toUpperCase(),
        requiredPermissions,
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied. Missing required permission.',
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Permission verification failed.',
      });
    }
  };
};

/**
 * Multi-tenant isolation middleware
 * Verifies user belongs to requested school
 */
const requireSchool = (req, res, next) => {
  try {
    const { schoolId } = req.params;

    // Super Admin can access all schools
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    // Check if user's schoolId matches requested schoolId
    if (!req.user.schoolId || req.user.schoolId !== parseInt(schoolId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. You can only access your own school data.'
      });
    }

    next();

  } catch (error) {
    console.error('School check error:', error);
    return res.status(500).json({
      success: false,
      error: 'School verification failed.'
    });
  }
};

// ============================================
// PRE-DEFINED ROLE CHECKS
// ============================================

const requireSuperAdmin = requireRole('SUPER_ADMIN');

const requireAdmin = requireRole(['SUPER_ADMIN', 'SCHOOL_ADMIN']);

const requireTeacher = requireRole([
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'TEACHER',
  'HOMEROOM_TEACHER'
]);

const requireHomeroomTeacher = requireRole('HOMEROOM_TEACHER');

module.exports = {
  requireRole,
  requireSchool,
  requireSuperAdmin,
  requireAdmin,
  requireTeacher,
  requireHomeroomTeacher,
  requirePermission,
  requireAnyPermission,
  ROLE_PERMISSIONS,
};