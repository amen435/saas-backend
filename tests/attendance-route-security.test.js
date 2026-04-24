const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('/attendance/recognize route requires authentication and staff authorization', () => {
  const routeFile = path.join(__dirname, '..', 'src', 'routes', 'attendance.routes.js');
  const source = fs.readFileSync(routeFile, 'utf8');

  const recognizeRoutePattern = /router\.post\(\s*'\/recognize'[\s\S]*?authenticateToken[\s\S]*?requireAnyPermission\(\['attendance:write', 'attendance:write:assigned', 'school:manage'\]\)[\s\S]*?requireRole\(\['TEACHER', 'HOMEROOM_TEACHER', 'SCHOOL_ADMIN'\]\)[\s\S]*?attendanceController\.recognizeAttendance[\s\S]*?\);/;

  assert.match(source, recognizeRoutePattern);
});
