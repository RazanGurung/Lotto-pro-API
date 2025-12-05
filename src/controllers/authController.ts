import { Request, Response } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../config/database';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';
import { LoginRequest, RegisterRequest, SuperAdmin } from '../models/types';
import { AuthRequest } from '../middleware/auth';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, phone }: RegisterRequest = req.body;

    // Validate input
    if (!email || !password || !full_name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    if (!phone) {
      res.status(400).json({ error: 'Phone number is required' });
      return;
    }

    // Check if store owner already exists
    const [existingUser] = await pool.query(
      'SELECT * FROM STORE_OWNER WHERE email = ?',
      [email]
    );
    if ((existingUser as any[]).length > 0) {
      res
        .status(400)
        .json({ error: 'Store owner with this email already exists' });
      return;
    }

    // Hash password
    const password_hash = await hashPassword(password);

    // Insert new store owner
    const [result] = await pool.query(
      'INSERT INTO STORE_OWNER (name, email, phone, password) VALUES (?, ?, ?, ?)',
      [full_name, email, phone, password_hash]
    );

    const insertId = (result as any).insertId;

    // Get the newly created store owner
    const [newUser] = await pool.query(
      'SELECT owner_id as id, name as full_name, email, phone, created_at FROM STORE_OWNER WHERE owner_id = ?',
      [insertId]
    );

    const user = (newUser as any[])[0];
    const token = generateToken({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: 'store_owner',
    });

    res.status(201).json({
      user,
      token,
      message: 'Store owner registered successfully',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
};

/// LOGIN
const SUPER_ADMIN_DOMAIN = (
  process.env.SUPER_ADMIN_DOMAIN || '@lottopro.com'
).toLowerCase();

const isSuperAdminEmail = (email: string): boolean => {
  const normalized = email.toLowerCase();
  return SUPER_ADMIN_DOMAIN.startsWith('@')
    ? normalized.endsWith(SUPER_ADMIN_DOMAIN)
    : normalized.endsWith(`@${SUPER_ADMIN_DOMAIN}`);
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (isSuperAdminEmail(email)) {
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

      res.status(200).json({
        admin: {
          id: admin.super_admin_id,
          name: admin.name,
          email: admin.email,
          created_at: admin.created_at,
        },
        token,
        redirectTo: '/api/super-admin/profile',
        message: 'Super admin login successful',
      });
      return;
    }

    // Find store owner
    const [result] = await pool.query(
      'SELECT * FROM STORE_OWNER WHERE email = ?',
      [email]
    );
    if ((result as any[]).length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const storeOwner: any = (result as any[])[0];

    // Verify password
    const isValidPassword = await comparePassword(
      password,
      storeOwner.password
    );
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate token
    const user = {
      id: storeOwner.owner_id,
      email: storeOwner.email,
      full_name: storeOwner.name,
      phone: storeOwner.phone,
      password_hash: storeOwner.password,
      created_at: storeOwner.created_at,
      updated_at: storeOwner.created_at, // STORE_OWNER doesn't have updated_at
    };

    const token = generateToken({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: 'store_owner',
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = storeOwner;
    const userResponse = {
      id: storeOwner.owner_id,
      email: storeOwner.email,
      full_name: storeOwner.name,
      phone: storeOwner.phone,
      created_at: storeOwner.created_at,
    };

    res.status(200).json({
      user: userResponse,
      token,
      redirectTo: '/api/auth/profile',
      message: 'Store owner login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

export const getProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (user.role === 'super_admin') {
      const [admins] = await pool.query(
        'SELECT super_admin_id as id, name, email, created_at FROM SUPER_ADMIN WHERE super_admin_id = ?',
        [user.id]
      );

      if ((admins as any[]).length === 0) {
        res.status(404).json({ error: 'Super admin not found' });
        return;
      }

      res.status(200).json({
        admin: (admins as any[])[0],
      });
      return;
    }

    if (user.role === 'store_account') {
      const [stores] = await pool.query(
        `SELECT
          store_id as id,
          owner_id,
          store_name,
          address,
          city,
          state,
          zipcode,
          contact_number,
          lottery_ac_no,
          created_at
        FROM stores WHERE store_id = ?`,
        [user.id]
      );

      if ((stores as any[]).length === 0) {
        res.status(404).json({ error: 'Store not found' });
        return;
      }

      res.status(200).json({
        store: (stores as any[])[0],
      });
      return;
    }

    const [owners] = await pool.query(
      'SELECT owner_id as id, name as full_name, email, phone, created_at FROM STORE_OWNER WHERE owner_id = ?',
      [user.id]
    );

    if ((owners as any[]).length === 0) {
      res.status(404).json({ error: 'Store owner not found' });
      return;
    }

    res.status(200).json({
      user: (owners as any[])[0],
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateStoreOwnerProfile = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    const { full_name, email, phone, password } = req.body;

    if (!user || user.role !== 'store_owner') {
      res.status(403).json({ error: 'Only store owners can update this profile' });
      return;
    }

    if (!full_name && !email && !phone && !password) {
      res
        .status(400)
        .json({ error: 'Provide at least one field to update (name, email, phone, password)' });
      return;
    }

    if (email) {
      const [existing] = await pool.query(
        'SELECT owner_id FROM STORE_OWNER WHERE email = ? AND owner_id != ?',
        [email, user.id]
      );

      if ((existing as any[]).length > 0) {
        res.status(400).json({ error: 'Email already in use by another account' });
        return;
      }
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (full_name) {
      updates.push('name = ?');
      values.push(full_name);
    }

    if (email) {
      updates.push('email = ?');
      values.push(email);
    }

    if (phone) {
      updates.push('phone = ?');
      values.push(phone);
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

    values.push(user.id);

    await pool.query(
      `UPDATE STORE_OWNER SET ${updates.join(', ')} WHERE owner_id = ?`,
      values
    );

    const [owners] = await pool.query(
      'SELECT owner_id as id, name as full_name, email, phone, created_at FROM STORE_OWNER WHERE owner_id = ?',
      [user.id]
    );

    res.status(200).json({
      user: (owners as any[])[0],
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Update store owner profile error:', error);
    res.status(500).json({ error: 'Server error updating profile' });
  }
};

export const deleteStoreOwnerAccount = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  let connection: PoolConnection | null = null;

  try {
    const user = req.user;

    if (!user || user.role !== 'store_owner') {
      res.status(403).json({ error: 'Only store owners can delete this account' });
      return;
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [stores] = await connection.query(
      'SELECT store_id FROM stores WHERE owner_id = ?',
      [user.id]
    );

    const storeIds = (stores as any[]).map((store) => store.store_id);

    if (storeIds.length > 0) {
      const storePlaceholders = storeIds.map(() => '?').join(', ');

      const [inventories] = await connection.query(
        `SELECT id FROM store_lottery_inventory WHERE store_id IN (${storePlaceholders})`,
        storeIds
      );

      const inventoryIds = (inventories as any[]).map((item) => item.id);

      if (inventoryIds.length > 0) {
        const inventoryPlaceholders = inventoryIds.map(() => '?').join(', ');

        await connection.query(
          `DELETE FROM tickets WHERE inventory_id IN (${inventoryPlaceholders})`,
          inventoryIds
        );
      }

      await connection.query(
        `DELETE FROM store_lottery_inventory WHERE store_id IN (${storePlaceholders})`,
        storeIds
      );

      await connection.query(
        `DELETE FROM scanned_tickets WHERE store_id IN (${storePlaceholders})`,
        storeIds
      );

      await connection.query(
        `DELETE FROM stores WHERE store_id IN (${storePlaceholders}) AND owner_id = ?`,
        [...storeIds, user.id]
      );
    }

    await connection.query('DELETE FROM scanned_tickets WHERE scanned_by = ?', [user.id]);

    await connection.query('DELETE FROM STORE_OWNER WHERE owner_id = ?', [user.id]);

    await connection.commit();

    res.status(200).json({
      message: 'Store owner account and associated stores deleted successfully',
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Delete store owner account error:', error);
    res.status(500).json({ error: 'Server error deleting account' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
