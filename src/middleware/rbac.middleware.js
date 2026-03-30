// src/middleware/rbac.middleware.js

/**
 * Role-Based Access Control Middleware
 * Checks if user has required role(s)
 */
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

      // Prefer activeRole (X-Active-Role), fall back to base role
      const effectiveRole = req.user.activeRole || req.user.role;

      // Check if user's effective role is allowed
      if (!roles.includes(effectiveRole)) {
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
  requireHomeroomTeacher
};