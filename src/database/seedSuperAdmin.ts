import { pool } from '../config/database';
import { hashPassword } from '../utils/auth';

const run = async () => {
  const [name, email, password] = process.argv.slice(2);

  if (!name || !email || !password) {
    console.error(
      'Usage: ts-node src/database/seedSuperAdmin.ts <name> <email> <password>'
    );
    process.exit(1);
  }

  try {
    const [existing] = await pool.query(
      'SELECT super_admin_id FROM SUPER_ADMIN WHERE email = ?',
      [email]
    );

    if (Array.isArray(existing) && existing.length > 0) {
      console.error(`Super admin with email ${email} already exists.`);
      process.exit(1);
    }

    const hashedPassword = await hashPassword(password);

    const [result] = await pool.query(
      'INSERT INTO SUPER_ADMIN (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    console.log('Super admin created with ID:', (result as any).insertId);
  } catch (error) {
    console.error('Failed to create super admin:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

run();

/// to add super admin
// npm run seed:superadmin -- "name" "email" "password"
