const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const prismaSchema = 'prisma/schema.prisma';
const prismaMigrationsDir = path.join(process.cwd(), 'prisma', 'migrations');

const run = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (error) => {
      console.error(`Failed to start command: ${command} ${args.join(' ')}`);
      console.error(error);
      resolve(1);
    });
  });

const requiredEnv = ['DATABASE_URL', 'JWT_SECRET'];

const getMigrationDirectories = () =>
  fs
    .readdirSync(prismaMigrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const logEnvStatus = () => {
  const summary = {
    NODE_ENV: process.env.NODE_ENV || '(unset)',
    DATABASE_URL: process.env.DATABASE_URL ? 'present' : 'missing',
    JWT_SECRET: process.env.JWT_SECRET ? 'present' : 'missing',
    FRONTEND_URL: process.env.FRONTEND_URL || '(unset)',
    APP_BASE_URL: process.env.APP_BASE_URL || '(unset)',
    COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE || '(unset)',
  };

  console.log('Render startup environment summary:');
  console.log(summary);
};

const ensureRequiredEnv = () => {
  const missing = requiredEnv.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }

  return true;
};

const runMigrations = async () => {
  console.log('Checking Prisma migration status...');
  await run('npx', ['prisma', 'migrate', 'status', `--schema=${prismaSchema}`]);

  console.log('Applying Prisma migrations...');
  const migrateCode = await run('npx', ['prisma', 'migrate', 'deploy', `--schema=${prismaSchema}`]);

  if (migrateCode === 0) {
    return true;
  }

  console.error('Prisma migrate deploy failed.');
  console.error('Common causes: invalid DATABASE_URL, missing DB permissions, or a failing migration.');

  if (String(process.env.ALLOW_PRISMA_BASELINE || '').toLowerCase() === 'true') {
    console.warn('ALLOW_PRISMA_BASELINE=true detected. Attempting one-time baseline for an existing non-empty database.');
    const migrations = getMigrationDirectories();

    for (const migration of migrations) {
      console.log(`Marking migration as applied: ${migration}`);
      const resolveCode = await run('npx', [
        'prisma',
        'migrate',
        'resolve',
        '--applied',
        migration,
        `--schema=${prismaSchema}`,
      ]);

      if (resolveCode !== 0) {
        console.error(`Failed while baselining migration ${migration}.`);
        return false;
      }
    }

    console.log('Baseline complete. Re-running prisma migrate deploy...');
    const deployAfterBaselineCode = await run('npx', [
      'prisma',
      'migrate',
      'deploy',
      `--schema=${prismaSchema}`,
    ]);

    if (deployAfterBaselineCode === 0) {
      return true;
    }

    console.error('Prisma migrate deploy still failed after baselining.');
    return false;
  }

  if (String(process.env.ALLOW_PRISMA_DB_PUSH || '').toLowerCase() === 'true') {
    console.warn('ALLOW_PRISMA_DB_PUSH=true detected. Running explicit fallback: prisma db push --skip-generate');
    const pushCode = await run('npx', ['prisma', 'db', 'push', '--skip-generate', `--schema=${prismaSchema}`]);
    return pushCode === 0;
  }

  console.error(
    'Refusing fallback. Set ALLOW_PRISMA_BASELINE=true for a one-time baseline of an existing DB, or ALLOW_PRISMA_DB_PUSH=true only for a temporary staging recovery if you explicitly accept the risk.'
  );
  return false;
};

const startServer = async () => {
  console.log('Starting application server...');
  const serverCode = await run('node', ['server.js']);
  process.exit(serverCode);
};

const main = async () => {
  logEnvStatus();

  if (!ensureRequiredEnv()) {
    process.exit(1);
  }

  const migrationsOk = await runMigrations();
  if (!migrationsOk) {
    process.exit(1);
  }

  await startServer();
};

main().catch((error) => {
  console.error('Render startup failed unexpectedly.');
  console.error(error);
  process.exit(1);
});
