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
// src/config/database.ts
// import mysql from 'mysql2/promise';
// import dotenv from 'dotenv';

// dotenv.config();

// export let pool: mysql.Pool;

// export const connectDB = async () => {
//   if (pool) return pool; // already created

//   pool = mysql.createPool({
//     host: process.env.MYSQLHOST,
//     user: process.env.MYSQLUSER,
//     password: process.env.MYSQLPASSWORD,
//     database: process.env.MYSQLDATABASE,
//     port: Number(process.env.MYSQLPORT) || 3306,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
//   });

//   // Test connection
//   const [rows] = await pool.query('SELECT 1 + 1 AS result');
//   console.log('DB Test Result:', rows);

//   console.log('✅ MySQL connected');
//   return pool;
// };

// import mysql from 'mysql2/promise';
// import dotenv from 'dotenv';

// dotenv.config();

// export let pool: mysql.Pool;

// export const connectDB = async () => {
//   if (pool) return pool; // Already connected

//   try {
//     // Debug log to verify Railway env variables
//     console.log('🔍 DB ENV:', {
//       host: process.env.MYSQLHOST,
//       user: process.env.MYSQLUSER,
//       db: process.env.MYSQLDATABASE,
//       port: process.env.MYSQLPORT,
//     });

//     pool = mysql.createPool({
//       host: process.env.MYSQLHOST,
//       user: process.env.MYSQLUSER,
//       password: process.env.MYSQLPASSWORD,
//       database: process.env.MYSQLDATABASE,
//       port: Number(process.env.MYSQLPORT) || 3306,
//       waitForConnections: true,
//       connectionLimit: 10,
//       queueLimit: 0,
//     });

//     // Test query
//     const [rows] = await pool.query('SELECT 1 + 1 AS result');
//     console.log('DB Test Result:', rows);

//     console.log('✅ MySQL connected');
//     return pool;
//   } catch (err) {
//     console.error('❌ MySQL Connection Failed:', err);
//     throw err; // So server.ts can catch it
//   }
// };

// import mysql from 'mysql2/promise';
// import dotenv from 'dotenv';

// dotenv.config();

// export let pool: mysql.Pool | null = null;

// export const connectDB = async () => {
//   if (pool) return pool; // already created

//   try {
//     // Log what the backend actually sees
//     console.log('🔍 DB ENV:', {
//       host: process.env.DB_HOST,
//       user: process.env.DB_USER,
//       db: process.env.DB_NAME,
//       port: process.env.DB_PORT,
//     });

//     const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT } = process.env;

//     if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME || !DB_PORT) {
//       throw new Error('Missing one or more DB_* environment variables');
//     }

//     pool = mysql.createPool({
//       host: DB_HOST,
//       user: DB_USER,
//       password: DB_PASSWORD,
//       database: DB_NAME,
//       port: Number(DB_PORT) || 3306,
//       waitForConnections: true,
//       connectionLimit: 10,
//       queueLimit: 0,
//     });

//     // Test connection
//     const [rows] = await pool.query('SELECT 1 + 1 AS result');
//     console.log('DB Test Result:', rows);

//     console.log('✅ MySQL connected');
//     return pool;
//   } catch (err) {
//     console.error('❌ MySQL Connection Failed:', err);
//     throw err;
//   }
// };

///// -=====================+ONLINE HOSTING  -=====================+
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export let pool!: mysql.Pool;

export const connectDB = async () => {
  // If we've already created the pool, just reuse it
  if (pool) return pool;

  try {
    // Support both Railway's MYSQL* vars and custom DB_* vars
    const host = process.env.MYSQLHOST || process.env.DB_HOST;
    const user = process.env.MYSQLUSER || process.env.DB_USER;
    const password = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD;
    const database = process.env.MYSQLDATABASE || process.env.DB_NAME;
    const port = process.env.MYSQLPORT || process.env.DB_PORT || '3306';

    if (!host || !user || !password || !database) {
      console.error('❌ Missing database environment variables');
      console.error(
        'Required: MYSQLHOST/DB_HOST, MYSQLUSER/DB_USER, MYSQLPASSWORD/DB_PASSWORD, MYSQLDATABASE/DB_NAME'
      );
      throw new Error('Missing database environment variables');
    }

    console.log('🔍 DB Connection Config:', {
      host,
      user,
      database,
      port,
    });

    // Create the pool once
    pool = mysql.createPool({
      host,
      user,
      password,
      database,
      port: Number(port),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,
    });

    // Test connection
    console.log('🔄 Testing database connection...');
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    console.log('✅ DB Test Result:', rows);
    console.log('✅ MySQL connected successfully');

    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};
