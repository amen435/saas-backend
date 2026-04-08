const { writeAudit } = require('../utils/auditLogger');

const auditAuthorizedAccess = (resource) => (req, res, next) => {
  writeAudit('auth.access_granted', {
    resource,
    userId: req.user?.userId || null,
    role: req.user?.role || null,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  });
  next();
};

module.exports = { auditAuthorizedAccess };
