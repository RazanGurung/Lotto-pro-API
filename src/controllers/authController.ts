import { Request, Response } from 'express';
import { pool } from '../config/database';
import { hashPassword, comparePassword, generateToken } from '../utils/auth';
import { LoginRequest, RegisterRequest, User } from '../models/types';

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
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
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
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

export const getProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const [result] = await pool.query(
      'SELECT owner_id as id, name as full_name, email, phone, created_at FROM STORE_OWNER WHERE owner_id = ?',
      [userId]
    );

    if ((result as any[]).length === 0) {
      res.status(404).json({ error: 'Store owner not found' });
      return;
    }

    res.status(200).json({ user: (result as any[])[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
