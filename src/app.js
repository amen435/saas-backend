// src/app.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const schoolRoutes = require('./routes/school.routes');
const userRoutes = require('./routes/user.routes');
const profileRoutes = require('./routes/profile.routes');
const classRoutes = require('./routes/class.routes');

// Admin routes
const adminTeacherRoutes = require('./routes/admin.teacher.routes'); // School Admin creates/manages teachers
const adminStudentRoutes = require('./routes/admin.student.routes'); // School Admin views all students

// Teacher routes (Teachers access their own data)
const normalTeacherRoutes = require('./routes/teacher.normal.routes');
const homeroomTeacherRoutes = require('./routes/homeroom.routes');
const subjectRoutes = require('./routes/subject.routes'); // Subject management routes
const gradeRoutes = require('./routes/grade.routes'); // Grade management routes
const attendanceRoutes = require('./routes/attendance.routes');
const teacherAttendanceRoutes = require('./routes/teacherAttendance.routes');
const messageRoutes = require('./routes/message.routes'); // ← ADD THIS
const announcementRoutes = require('./routes/announcement.routes'); // ← ADD THIS
const timetableRoutes = require('./routes/timetable.routes'); // ← ADD THIS
const timetableViewRoutes = require('./routes/timetableView.routes'); // ← ADD THIS
const studentMeRoutes = require('./routes/studentMe.routes');
const parentMeRoutes = require('./routes/parentMe.routes');

// AI Routes
const aiChatRoutes = require('./ai/routes/aiChat.routes');
const aiHomeworkRoutes = require('./ai/routes/aiHomework.routes');
const aiAnalyticsRoutes = require('./ai/routes/aiAnalytics.routes');

const app = express();
const uploadsDir = path.join(__dirname, '..', 'uploads');
const isProduction = (process.env.NODE_ENV || 'development') === 'production';

fs.mkdirSync(uploadsDir, { recursive: true });

// Render and other managed platforms sit behind a reverse proxy, so Express
// needs to trust forwarded headers for rate limiting and client IP detection.
if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
const normalizeOrigin = (value) =>
  String(value || '')
    .trim()
    .replace(/^["']|["']$/g, '');

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const allowedOriginsFromEnv = normalizeOrigin(process.env.FRONTEND_URL)
  .split(',')
  .map((o) => normalizeOrigin(o))
  .filter(Boolean);

const allowedOrigins = isProduction
  ? (allowedOriginsFromEnv.length > 0 ? allowedOriginsFromEnv : DEFAULT_ALLOWED_ORIGINS)
  : Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...allowedOriginsFromEnv]));

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header), e.g. curl/Postman.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (!isProduction) {
        console.warn('CORS blocked for origin:', origin);
        console.warn('Allowed origins:', allowedOrigins);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  '/uploads',
  express.static(uploadsDir, {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

app.get('/api', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/attendance', attendanceRoutes);

// Admin routes
app.use('/api/admin/teachers', adminTeacherRoutes); // School admin creates/manages teachers
app.use('/api/admin/students', adminStudentRoutes); // School admin views all students

// Teacher routes
app.use('/api/teacher', normalTeacherRoutes);       // Normal teacher operations
app.use('/api/homeroom', homeroomTeacherRoutes);    // Homeroom teacher operations
app.use('/api/teacher-attendance', teacherAttendanceRoutes);
app.use('/api/subjects', subjectRoutes); // Subject management routes (accessible by school admins and teachers)
app.use('/api/grades', gradeRoutes); // Grade management routes
app.use('/api/messages', messageRoutes); // ← ADD THIS
app.use('/api/announcements', announcementRoutes); // ← ADD THIS
app.use('/api/timetable', timetableRoutes); // ← ADD THIS
app.use('/api/timetable/view', timetableViewRoutes); // ← ADD THIS
app.use('/api/parents', parentMeRoutes);
app.use('/api/students', studentMeRoutes);

// AI Routes
app.use('/api/ai/chat', aiChatRoutes);
app.use('/api/ai/homework', aiHomeworkRoutes);
app.use('/api/ai/analytics', aiAnalyticsRoutes);

app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: `Route not found: ${req.method} ${req.url}` 
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const path = middleware.regexp.source
            .replace('\\/?', '')
            .replace('(?=\\/|$)', '')
            .replace(/\\\//g, '/')
            .replace(/\^/g, '');
          
          routes.push({
            path: path + handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });

  console.log('📋 Registered Grade Routes:');
const gradeRouter = require('./routes/grade.routes');
gradeRouter.stack.forEach(layer => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
    console.log(`${methods} /api/grades${layer.route.path}`);
  }
});
  
  res.json({ total: routes.length, routes });
});
module.exports = app;
