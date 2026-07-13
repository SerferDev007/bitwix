import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Enable TLS for managed databases (e.g. Amazon RDS) via DB_SSL=true.
// RDS traffic stays inside the VPC, so verification can be relaxed with
// DB_SSL_REJECT_UNAUTHORIZED=false if you don't bundle the RDS CA.
const dbSsl = process.env.DB_SSL === 'true'
  ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } }
  : {};

// A shared connection pool. Reusing connections is important so the API
// doesn't open a brand new socket to MySQL on every single request.
// A test harness may inject an in-memory pool via globalThis.__FAKE_POOL__.
export const pool = globalThis.__FAKE_POOL__ || mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bitwix',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  ...dbSsl,
});

// Verify the database is reachable at startup so we fail loudly and early
// with a helpful message instead of on the first request.
export async function assertDbConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}
