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

async function start() {
  try {
    await assertDbConnection();
    console.log('✅ Connected to MySQL.');
  } catch (err) {
    console.error('❌ Could not connect to MySQL:', err.message);
    console.error('   Check your Backend/.env settings and that MySQL is running,');
    console.error('   then run `npm run db:init` to create the database.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Bitwix backend running at http://localhost:${PORT}`);
    console.log(`   Allowed CORS origins: ${allowedOrigins.join(', ')}`);
  });
}

start();
