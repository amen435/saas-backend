const test = require('node:test');
const assert = require('node:assert/strict');

const {
  requirePermission,
  requireAnyPermission,
} = require('../src/middleware/rbac.middleware');
const {
  ensureStudentOwnsStudentParam,
  ensureParentOwnsStudentParam,
} = require('../src/middleware/ownership.middleware');
const { ensureTeacherAssignedClass } = require('../src/middleware/assignment.middleware');
const { requireSchool } = require('../src/middleware/rbac.middleware');
const prisma = require('../src/config/database');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('student is denied from admin permission (system:admin)', async () => {
  const req = { user: { userId: 's1', role: 'STUDENT' }, method: 'GET', originalUrl: '/api/schools', ip: '127.0.0.1' };
  const res = mockRes();
  let called = false;

  await requirePermission('system:admin')(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('missing permission is denied by requireAnyPermission', async () => {
  const req = { user: { userId: 'p1', role: 'PARENT' }, method: 'POST', originalUrl: '/api/grades/components', ip: '127.0.0.1' };
  const res = mockRes();
  let called = false;

  await requireAnyPermission(['grades:write', 'school:manage'])(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});

test('student cannot access another student record (IDOR)', async () => {
  const originalFind = prisma.student.findFirst;
  prisma.student.findFirst = async () => ({ userId: 'another-user' });

  const req = {
    user: { userId: 'student-owner', role: 'STUDENT', schoolId: 1 },
    params: { studentId: '77' },
    method: 'GET',
    originalUrl: '/api/grades/student/77',
    ip: '127.0.0.1',
  };
  const res = mockRes();
  let called = false;

  await ensureStudentOwnsStudentParam(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);

  prisma.student.findFirst = originalFind;
});

test('parent cannot access non-child record (IDOR)', async () => {
  const originalParentFind = prisma.parent.findFirst;
  const originalRelationFind = prisma.parentStudent.findFirst;
  prisma.parent.findFirst = async () => ({ parentId: 5 });
  prisma.parentStudent.findFirst = async () => null;

  const req = {
    user: { userId: 'parent-user', role: 'PARENT', schoolId: 2 },
    params: { studentId: '99' },
    method: 'GET',
    originalUrl: '/api/attendance/student/99',
    ip: '127.0.0.1',
  };
  const res = mockRes();
  let called = false;

  await ensureParentOwnsStudentParam(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);

  prisma.parent.findFirst = originalParentFind;
  prisma.parentStudent.findFirst = originalRelationFind;
});

test('teacher cannot access unassigned class', async () => {
  const originalFind = prisma.class.findFirst;
  prisma.class.findFirst = async () => null;

  const req = {
    user: { userId: 'teacher-1', role: 'TEACHER', schoolId: 10 },
    params: { classId: '501' },
    body: {},
    query: {},
    method: 'GET',
    originalUrl: '/api/attendance/class/501',
    ip: '127.0.0.1',
  };
  const res = mockRes();
  let called = false;

  await ensureTeacherAssignedClass(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);

  prisma.class.findFirst = originalFind;
});

test('cross-school access is denied by requireSchool', async () => {
  const req = {
    user: { role: 'SCHOOL_ADMIN', schoolId: 1 },
    params: { schoolId: '2' },
  };
  const res = mockRes();
  let called = false;

  requireSchool(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
});
