import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/index.js';
import { assertDbConnection } from './config/db.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Allow the configured frontend origin(s) to call this API.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser tools (curl/Postman) which send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  })
);

app.use(express.json({ limit: '100kb' }));
// Trust the first proxy so req.ip reflects the real client behind a reverse proxy.
app.set('trust proxy', 1);

// Health check.
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', service: 'bitwix-backend' });
});

app.use('/api', apiRoutes);

// 404 for unknown API routes.
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Centralized error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  const status = err.message?.includes('CORS') ? 403 : 500;
  res.status(status).json({
    success: false,
    message:
      status === 403 ? err.message : 'Something went wrong. Please try again later.',
  });
});

// Retry the DB connection a few times before giving up. Managed databases
// (RDS) and freshly-started local servers can be briefly unavailable at boot.
async function connectWithRetry(attempts = Number(process.env.DB_CONNECT_RETRIES) || 10, delayMs = 3000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await assertDbConnection();
      console.log('✅ Connected to MySQL.');
      return;
    } catch (err) {
      const code = err.code || err.message || 'unknown error';
      if (i === attempts) throw err;
      console.warn(`⏳ MySQL not ready (${code}); retry ${i}/${attempts - 1} in ${delayMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function start() {
  // On first deploy against a fresh database, set RUN_DB_INIT=true to create
  // and seed the schema automatically (idempotent). Unset it afterwards.
  if (process.env.RUN_DB_INIT === 'true') {
    try {
      const { initializeDatabase } = await import('./scripts/initDb.js');
      console.log('RUN_DB_INIT=true — ensuring database schema...');
      await initializeDatabase();
    } catch (err) {
      console.error('❌ Database initialization failed:', err.message);
      process.exit(1);
    }
  }

  try {
    await connectWithRetry();
  } catch (err) {
    console.error('❌ Could not connect to MySQL:', err.code || err.message);
    console.error('   Check the DB_* settings and that the database is reachable,');
    console.error('   then run `npm run db:init` (or set RUN_DB_INIT=true) to create it.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Bitwix backend running on port ${PORT}`);
    console.log(`   Allowed CORS origins: ${allowedOrigins.join(', ')}`);
  });
}

start();
