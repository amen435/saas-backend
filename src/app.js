const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
require('dotenv').config();

const { requireCsrfProtection } = require('./middleware/auth.middleware');
const { AUTH_COOKIE_NAME, parseCookies } = require('./utils/security.utils');
const { resolvePrivateUploadPath } = require('./utils/imageSecurity.utils');

const authRoutes = require('./routes/auth.routes');
const schoolRoutes = require('./routes/school.routes');
const userRoutes = require('./routes/user.routes');
const profileRoutes = require('./routes/profile.routes');
const classRoutes = require('./routes/class.routes');
const adminTeacherRoutes = require('./routes/admin.teacher.routes');
const adminStudentRoutes = require('./routes/admin.student.routes');
const teacherManagementRoutes = require('./routes/teacher.routes');
const normalTeacherRoutes = require('./routes/teacher.normal.routes');
const homeroomTeacherRoutes = require('./routes/homeroom.routes');
const subjectRoutes = require('./routes/subject.routes');
const gradeRoutes = require('./routes/grade.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const teacherAttendanceRoutes = require('./routes/teacherAttendance.routes');
const messageRoutes = require('./routes/message.routes');
const announcementRoutes = require('./routes/announcement.routes');
const timetableRoutes = require('./routes/timetable.routes');
const timetableViewRoutes = require('./routes/timetableView.routes');
const studentMeRoutes = require('./routes/studentMe.routes');
const parentMeRoutes = require('./routes/parentMe.routes');
const deviceRoutes = require('./routes/device.routes');
const reportCardRoutes = require('./routes/reportCard.routes');
const aiChatRoutes = require('./ai/routes/aiChat.routes');
const aiHomeworkRoutes = require('./ai/routes/aiHomework.routes');
const aiAnalyticsRoutes = require('./ai/routes/aiAnalytics.routes');

const app = express();
const isProduction = (process.env.NODE_ENV || 'development') === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

const normalizeOrigin = (value) =>
  String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');

/** Browser Origin header is scheme + host (no path); FRONTEND_URL may wrongly include a trailing slash. */
const canonicalOrigin = (value) => {
  const raw = normalizeOrigin(value);
  if (!raw || raw === 'null') return '';
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return raw.replace(/\/+$/, '').toLowerCase();
  }
};

const isPublicVercelAppOrigin = (origin) => {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host === 'vercel.app' || host.endsWith('.vercel.app');
  } catch {
    return false;
  }
};

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Deployed SPAs (CORS). *.vercel.app is also allowed when CORS_ALLOW_VERCEL_PREVIEW is not false.
  'https://saas-alpha-gold.vercel.app',
  'https://saas-intellicampuse.vercel.app',
];

const allowedOriginsFromEnv = normalizeOrigin(process.env.FRONTEND_URL)
  .split(',')
  .map((origin) => canonicalOrigin(origin))
  .filter(Boolean);

// Always merge env origins with local dev defaults. Production used to be env-only; an empty
// FRONTEND_URL on Render then blocked every browser origin and looked like a "connection" failure.
const allowedOrigins = Array.from(
  new Set([
    ...DEFAULT_ALLOWED_ORIGINS.map((o) => canonicalOrigin(o)),
    ...allowedOriginsFromEnv,
  ])
);

// Default false in secure deployments: explicit origin allowlist only.
const allowVercelPreview =
  String(process.env.CORS_ALLOW_VERCEL_PREVIEW || 'false').toLowerCase() === 'true';

if (isProduction && allowedOriginsFromEnv.length === 0) {
  console.warn(
    '[CORS] FRONTEND_URL is empty. Localhost origins are still allowed; add FRONTEND_URL on the host (e.g. https://your-app.vercel.app) so your deployed SPA can call this API.'
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const key = canonicalOrigin(origin);
      if (key && allowedOrigins.includes(key)) return callback(null, true);

      if (allowVercelPreview && isPublicVercelAppOrigin(origin)) {
        return callback(null, true);
      }

      if (!isProduction) {
        console.warn('CORS blocked for origin:', origin);
        console.warn('Allowed origins:', allowedOrigins);
      } else {
        console.warn(
          '[CORS] Blocked origin (add canonical URL to FRONTEND_URL, no trailing slash; or keep CORS_ALLOW_VERCEL_PREVIEW=true for *.vercel.app):',
          origin
        );
      }

      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-CSRF-Token',
    ],
    maxAge: 86400,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.API_RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
});
app.use('/api', apiLimiter);

app.get('/uploads/:category/:filename', (req, res) => {
  const assetPath = `/uploads/${req.params.category}/${req.params.filename}`;
  const absolutePath = resolvePrivateUploadPath(assetPath);

  if (!absolutePath || !fs.existsSync(absolutePath)) {
    return res.status(404).json({
      success: false,
      error: 'Asset not found.',
    });
  }

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.sendFile(absolutePath);
});

app.get('/api', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/verify') {
    return next();
  }

  const cookies = parseCookies(req.headers.cookie || '');
  if (!cookies[AUTH_COOKIE_NAME]) {
    return next();
  }

  return requireCsrfProtection(req, res, next);
});

app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin/teachers', adminTeacherRoutes);
app.use('/api/admin/students', adminStudentRoutes);
app.use('/api/teachers', teacherManagementRoutes);
app.use('/api/teacher', normalTeacherRoutes);
app.use('/api/homeroom', homeroomTeacherRoutes);
app.use('/api/teacher-attendance', teacherAttendanceRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/timetable/view', timetableViewRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/parents', parentMeRoutes);
app.use('/api/students', studentMeRoutes);
app.use('/api/report-cards', reportCardRoutes);
app.use('/api/ai/chat', aiChatRoutes);
app.use('/api/ai/homework', aiHomeworkRoutes);
app.use('/api/ai/analytics', aiAnalyticsRoutes);

if (!isProduction) {
  app.get('/api/debug/routes', (req, res) => {
    const routes = [];

    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods),
        });
      }
    });

    res.json({ total: routes.length, routes });
  });
}

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.url}`,
  });
});

app.use((err, req, res, next) => {
  if (err?.message === 'Origin not allowed by CORS') {
    return res.status(403).json({ success: false, error: err.message });
  }

  const statusCode = Number(err?.statusCode) || 500;
  const message = statusCode >= 500 ? 'Internal server error' : err?.message || 'Request failed.';

  console.error('Unhandled error:', err?.message || err);
  return res.status(statusCode).json({
    success: false,
    error: message,
    ...(Array.isArray(err?.details) ? { details: err.details } : {}),
  });
});

module.exports = app;
