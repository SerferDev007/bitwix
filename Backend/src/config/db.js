import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// A shared connection pool. Reusing connections is important so the API
// doesn't open a brand new socket to MySQL on every single request.
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bitwix',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
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
