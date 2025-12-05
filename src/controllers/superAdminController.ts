import { Request, Response } from 'express';
import { pool } from '../config/database';
import { comparePassword, generateToken, hashPassword } from '../utils/auth';
import { LoginRequest, SuperAdmin } from '../models/types';
import { AuthRequest } from '../middleware/auth';

export const superAdminLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password }: LoginRequest = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const [admins] = await pool.query(
      'SELECT * FROM SUPER_ADMIN WHERE email = ?',
      [email]
    );

    if ((admins as SuperAdmin[]).length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const admin = (admins as SuperAdmin[])[0];
    const isValidPassword = await comparePassword(password, admin.password);

    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken({
      id: admin.super_admin_id,
      email: admin.email,
      full_name: admin.name,
      role: 'super_admin',
    });

    const adminResponse = {
      id: admin.super_admin_id,
      name: admin.name,
      email: admin.email,
      created_at: admin.created_at,
    };

    res.status(200).json({
      admin: adminResponse,
      token,
      message: 'Super admin login successful',
    });
  } catch (error) {
    console.error('Super admin login error:', error);
    res.status(500).json({ error: 'Server error during super admin login' });
  }
};

export const getSuperAdminProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;

    if (!adminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const [admins] = await pool.query(
      'SELECT super_admin_id as id, name, email, created_at FROM SUPER_ADMIN WHERE super_admin_id = ?',
      [adminId]
    );

    if ((admins as any[]).length === 0) {
      res.status(404).json({ error: 'Super admin not found' });
      return;
    }

    res.status(200).json({ admin: (admins as any[])[0] });
  } catch (error) {
    console.error('Super admin profile error:', error);
    res.status(500).json({ error: 'Server error retrieving profile' });
  }
};

export const updateSuperAdminProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    const { name, email, password } = req.body;

    if (!adminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!name && !email && !password) {
      res
        .status(400)
        .json({ error: 'Please provide a field to update (name, email, or password)' });
      return;
    }

    if (email) {
      const [existing] = await pool.query(
        'SELECT super_admin_id FROM SUPER_ADMIN WHERE email = ? AND super_admin_id != ?',
        [email, adminId]
      );

      if ((existing as any[]).length > 0) {
        res.status(400).json({ error: 'Email already in use by another admin' });
        return;
      }
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (name) {
      updates.push('name = ?');
      values.push(name);
    }

    if (email) {
      updates.push('email = ?');
      values.push(email);
    }

    if (password) {
      const hashedPassword = await hashPassword(password);
      updates.push('password = ?');
      values.push(hashedPassword);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    values.push(adminId);

    await pool.query(
      `UPDATE SUPER_ADMIN SET ${updates.join(', ')} WHERE super_admin_id = ?`,
      values
    );

    const [updated] = await pool.query(
      'SELECT super_admin_id as id, name, email, created_at FROM SUPER_ADMIN WHERE super_admin_id = ?',
      [adminId]
    );

    res.status(200).json({
      admin: (updated as any[])[0],
      message: 'Super admin profile updated successfully',
    });
  } catch (error) {
    console.error('Super admin update error:', error);
    res.status(500).json({ error: 'Server error updating profile' });
  }
};
