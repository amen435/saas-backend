const test = require('node:test');
const assert = require('node:assert/strict');

const {
  serializeCookie,
  getCookieOptions,
  parseCookies,
} = require('../src/utils/security.utils');
const { validatePasswordStrength } = require('../src/utils/password.utils');

test('serializeCookie includes security attributes', () => {
  const cookie = serializeCookie('auth_token', 'abc', {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    path: '/',
    maxAge: 60,
  });

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=None/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=60/);
});

test('getCookieOptions hardens production cookies', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSameSite = process.env.COOKIE_SAME_SITE;

  process.env.NODE_ENV = 'production';
  process.env.COOKIE_SAME_SITE = 'None';

  const options = getCookieOptions();

  assert.equal(options.auth.httpOnly, true);
  assert.equal(options.auth.secure, true);
  assert.equal(options.auth.sameSite, 'None');
  assert.equal(options.csrf.sameSite, 'None');

  process.env.NODE_ENV = previousNodeEnv;
  process.env.COOKIE_SAME_SITE = previousSameSite;
});

test('parseCookies decodes request cookies', () => {
  const cookies = parseCookies('auth_token=abc123; csrf_token=xyz456');
  assert.equal(cookies.auth_token, 'abc123');
  assert.equal(cookies.csrf_token, 'xyz456');
});

test('validatePasswordStrength rejects weak passwords', () => {
  assert.ok(validatePasswordStrength('short'));
  assert.ok(validatePasswordStrength('alllowercasepassword'));
  assert.equal(validatePasswordStrength('StrongPassword!123'), null);
});
