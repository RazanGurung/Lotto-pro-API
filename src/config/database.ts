// import mysql from 'mysql2/promise';
// import dotenv from 'dotenv';

// dotenv.config();

// export const pool = mysql.createPool({
//   host: process.env.DB_HOST || 'localhost',
//   user: process.env.DB_USER || 'root',
//   password: process.env.DB_PASSWORD || 'B1i2s3h4a5l6',
//   database: process.env.DB_NAME || 'lotto_pro', /// change the db name to lotto_pro
//   port: parseInt(process.env.DB_PORT || '3306'),
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// });

// export const connectDB = async (): Promise<void> => {
//   try {
//     const connection = await pool.getConnection();
//     console.log('✓ Connected to MySQL database');
//     connection.release();
//   } catch (error) {
//     console.error('✗ Database connection error:', error);
//     process.exit(1);
//   }
// };

// src/config/database.ts
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export let pool: mysql.Pool;

export const connectDB = async () => {
  if (pool) return pool; // already created

  pool = mysql.createPool({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: Number(process.env.MYSQLPORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // Test connection
  const [rows] = await pool.query('SELECT 1 + 1 AS result');
  console.log('DB Test Result:', rows);

  console.log('✅ MySQL connected');
  return pool;
};
