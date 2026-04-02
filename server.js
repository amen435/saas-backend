require('dotenv').config();
const app = require('./src/app');

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

  if (isProduction && String(process.env.JWT_SECRET).includes('replace-with-a-random')) {
    throw new Error('Refusing to start with the placeholder JWT secret in production.');
  }
};

assertRequiredEnv();

app.listen(PORT, HOST, () => {
  const healthHost = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://${healthHost}:${PORT}/api`);
});
