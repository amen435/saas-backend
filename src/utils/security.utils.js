const crypto = require('crypto');

const AUTH_COOKIE_NAME = 'auth_token';
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

const parseCookies = (cookieHeader = '') => {
  return String(cookieHeader)
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) return acc;

      const key = decodeURIComponent(entry.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(entry.slice(separatorIndex + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
};

const serializeCookie = (name, value, options = {}) => {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

  return parts.join('; ');
};

const normalizeSameSite = (value, fallback = 'Lax') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'strict') return 'Strict';
  if (normalized === 'none') return 'None';
  if (normalized === 'lax') return 'Lax';
  return fallback;
};

const getCookieOptions = () => {
  const isProduction = (process.env.NODE_ENV || 'development') === 'production';
  const sameSite = normalizeSameSite(
    process.env.COOKIE_SAME_SITE,
    isProduction ? 'None' : 'Lax'
  );

  return {
    auth: {
      httpOnly: true,
      secure: isProduction,
      sameSite,
      path: '/',
      maxAge: 60 * 60 * 24,
    },
    csrf: {
      httpOnly: false,
      secure: isProduction,
      sameSite,
      path: '/',
      maxAge: 60 * 60 * 24,
    },
  };
};

const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

module.exports = {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  parseCookies,
  serializeCookie,
  getCookieOptions,
  generateCsrfToken,
};
