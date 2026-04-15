require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const { setIo } = require('./src/services/socket.service');

let SocketIoServer = null;
try {
  ({ Server: SocketIoServer } = require('socket.io'));
} catch (error) {
  SocketIoServer = null;
}

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = (process.env.NODE_ENV || 'development') === 'production';

const assertRequiredEnv = () => {
  const missing = ['DATABASE_URL', 'JWT_SECRET'].filter(
    (key) => !String(process.env[key] || '').trim()
  );

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const dbUrl = String(process.env.DATABASE_URL || '');
  const forUrlParse = dbUrl.replace(/^postgres(ql)?:\/\//i, 'http://');
  try {
    const parsed = new URL(forUrlParse);
    if (parsed.hostname === 'host') {
      throw new Error(
        'DATABASE_URL still uses the example hostname "host". Change it to localhost (local Postgres) or your real DB host from Neon/Supabase/Render.'
      );
    }
  } catch (e) {
    if (e.message.includes('DATABASE_URL still')) throw e;
  }

  if (isProduction && String(process.env.JWT_SECRET).includes('replace-with-a-random')) {
    throw new Error('Refusing to start with the placeholder JWT secret in production.');
  }
};

assertRequiredEnv();

const httpServer = http.createServer(app);
if (SocketIoServer) {
  const io = new SocketIoServer(httpServer, {
    cors: {
      origin: String(process.env.FRONTEND_URL || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      credentials: true,
    },
  });

  setIo(io);
} else {
  console.warn('Socket.IO dependency not installed; real-time attendance events are disabled.');
}

httpServer.listen(PORT, HOST, () => {
  const healthHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://${healthHost}:${PORT}/api`);
  console.log(
    SocketIoServer
      ? `Socket.IO enabled on http://${healthHost}:${PORT}`
      : 'Socket.IO disabled until dependencies are installed.'
  );
});
