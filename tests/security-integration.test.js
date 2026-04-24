const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const authController = require('../src/controllers/auth.controller');
const prisma = require('../src/config/database');

function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function loadFreshApp(extraEnv = {}) {
  const previous = {};
  for (const [key, value] of Object.entries(extraEnv)) {
    previous[key] = process.env[key];
    process.env[key] = String(value);
  }

  const appPath = require.resolve('../src/app');
  delete require.cache[appPath];
  const app = require('../src/app');

  return {
    app,
    restore() {
      for (const [key, value] of Object.entries(extraEnv)) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
      delete require.cache[appPath];
    },
  };
}

test('CSRF protection blocks invalid state-changing requests when auth cookie is present', async () => {
  const { app, restore } = loadFreshApp();
  const server = await startServer(app);

  try {
    const response = await fetch(`${server.baseUrl}/api/attendance/recognize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'auth_token=fake-token; csrf_token=csrf-cookie',
      },
      body: JSON.stringify({ imageBase64: 'abc', classId: 1 }),
    });

    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.error, 'Invalid CSRF token.');
  } finally {
    await server.close();
    restore();
  }
});

test('CORS rejects unauthorized origins', async () => {
  const { app, restore } = loadFreshApp({
    FRONTEND_URL: 'https://allowed.example.com',
    CORS_ALLOW_VERCEL_PREVIEW: 'false',
  });
  const server = await startServer(app);

  try {
    const response = await fetch(`${server.baseUrl}/api`, {
      headers: {
        Origin: 'https://blocked.example.com',
      },
    });

    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.error, 'Origin not allowed by CORS');
  } finally {
    await server.close();
    restore();
  }
});

test('Rate limiting blocks excessive requests', async () => {
  const { app, restore } = loadFreshApp({
    API_RATE_LIMIT_MAX: '2',
    API_RATE_LIMIT_WINDOW_MS: '60000',
  });
  const server = await startServer(app);

  try {
    const first = await fetch(`${server.baseUrl}/api`);
    const second = await fetch(`${server.baseUrl}/api`);
    const third = await fetch(`${server.baseUrl}/api`);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);

    const payload = await third.json();
    assert.equal(payload.error, 'Too many requests. Please try again later.');
  } finally {
    await server.close();
    restore();
  }
});

test('Logout clears secure auth cookies', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSameSite = process.env.COOKIE_SAME_SITE;
  process.env.NODE_ENV = 'production';
  process.env.COOKIE_SAME_SITE = 'None';

  const headers = {};
  const res = {
    statusCode: 200,
    payload: null,
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  const originalUserUpdate = prisma.user.update;
  prisma.user.update = async () => ({ userId: 'user-1' });

  try {
    await authController.logout({
      user: { userId: 'user-1' },
      ip: '127.0.0.1',
    }, res);

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(headers['Set-Cookie']));
    assert.match(headers['Set-Cookie'][0], /HttpOnly/);
    assert.match(headers['Set-Cookie'][0], /Secure/);
    assert.match(headers['Set-Cookie'][0], /SameSite=None/);
    assert.match(headers['Set-Cookie'][0], /Max-Age=0/);
  } finally {
    prisma.user.update = originalUserUpdate;
    process.env.NODE_ENV = previousNodeEnv;
    process.env.COOKIE_SAME_SITE = previousSameSite;
  }
});
