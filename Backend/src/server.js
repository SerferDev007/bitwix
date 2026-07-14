import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes/index.js';
import { pool, assertDbConnection } from './config/db.js';
import { reconcileLedger } from './fms/reconcile.js';
import { ensureHrSchema } from './hr/schema.js';
import { ensureCrmSchema } from './crm/schema.js';
import { ensureFmsSchema } from './fms/schema.js';

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
  // Multer upload errors (e.g. file too large) and other user-facing errors.
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 5 MB).' : `Upload error: ${err.message}`;
    return res.status(400).json({ success: false, message: msg });
  }
  if (err.userFacing) {
    return res.status(400).json({ success: false, message: err.message });
  }
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

// Apply idempotent schema migrations on every boot (CREATE IF NOT EXISTS,
// addColumnIfMissing, INSERT IGNORE config — NO destructive seeds), so deploying
// code that reads a new column never 500s waiting for a manual RUN_DB_INIT.
// Skipped on a truly fresh DB (RUN_DB_INIT handles the full first-time setup).
async function migrateSchema() {
  const conn = await pool.getConnection();
  try {
    const [[t]] = await conn.query(
      "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees'"
    );
    if (!t.c) return; // no base tables yet — RUN_DB_INIT does the full setup
    await ensureHrSchema(conn);
    await ensureCrmSchema(conn);
    await ensureFmsSchema(conn);
    console.log('✅ Schema migrations applied.');
  } finally {
    conn.release();
  }
}

// Periodically re-drive any operational fact whose ledger post was dropped, so
// the best-effort posts are eventually consistent without manual intervention.
// Interval (seconds) from RECONCILE_INTERVAL_SEC; defaults to 600s in production,
// disabled elsewhere. Runs never overlap, and the timer is unref'd so it never
// keeps the process alive on its own.
function startReconcileScheduler() {
  const raw = process.env.RECONCILE_INTERVAL_SEC;
  const sec = raw != null ? Number(raw) : (process.env.NODE_ENV === 'production' ? 600 : 0);
  if (!Number.isFinite(sec) || sec <= 0) return;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const out = await reconcileLedger({ id: null, role: 'SYSTEM' });
      if (out.deals || out.invoices || out.payroll || out.errors.length) {
        console.log(`🔁 [reconcile] deals=${out.deals} invoices=${out.invoices} payroll=${out.payroll} errors=${out.errors.length}`);
      }
    } catch (err) {
      console.error('🔁 [reconcile] sweep failed:', err.message);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(tick, 30_000); // catch anything dropped while we were down
  const timer = setInterval(tick, sec * 1000);
  first.unref?.();
  timer.unref?.();
  console.log(`🔁 Ledger reconcile scheduler enabled (every ${sec}s).`);
}

async function start() {
  // Bind the port FIRST so the platform health check (a TCP probe on PORT) passes
  // even while the database is connecting/initializing. A slow or failing DB step
  // then degrades individual endpoints (visible in logs) instead of crash-looping
  // the whole service — App Runner treats an early process exit as a failed deploy
  // and rolls back, so never exit during startup for a recoverable DB issue.
  app.listen(PORT, () => {
    console.log(`🚀 Bitwix backend running on port ${PORT}`);
    console.log(`   Allowed CORS origins: ${allowedOrigins.join(', ')}`);
  });

  // On first deploy against a fresh database, set RUN_DB_INIT=true to create
  // and seed the schema automatically (idempotent). Unset it afterwards.
  if (process.env.RUN_DB_INIT === 'true') {
    try {
      const { initializeDatabase } = await import('./scripts/initDb.js');
      console.log('RUN_DB_INIT=true — ensuring database schema...');
      await initializeDatabase();
      console.log('✅ Database schema ensured.');
    } catch (err) {
      // Log the FULL stack (not just message) and keep serving so the failure is
      // diagnosable in the application logs and the service stays healthy.
      console.error('❌ Database initialization failed:', err.stack || err.message);
    }
  }

  try {
    await connectWithRetry();
  } catch (err) {
    console.error('❌ Could not connect to MySQL:', err.code || err.message);
    console.error('   Check the DB_* settings and that the database is reachable.');
  }

  // Auto-apply pending schema migrations unless a full init already ran this boot.
  if (process.env.RUN_DB_INIT !== 'true') {
    try { await migrateSchema(); }
    catch (err) { console.error('⚠️  Schema migration failed:', err.stack || err.message); }
  }

  startReconcileScheduler();
}

start();
