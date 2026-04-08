const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', '..', 'logs');
const auditLogPath = path.join(logsDir, 'audit.log');

function safeString(value) {
  if (value == null) return '';
  return String(value).replace(/[\r\n\t]/g, ' ').slice(0, 500);
}

function writeAudit(event, details = {}) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    const payload = {
      timestamp: new Date().toISOString(),
      event: safeString(event),
      details,
    };
    fs.appendFileSync(auditLogPath, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch (error) {
    // Keep auth flow resilient if file logging fails.
    console.error('Audit log write failed:', error?.message || error);
  }
}

module.exports = { writeAudit };
