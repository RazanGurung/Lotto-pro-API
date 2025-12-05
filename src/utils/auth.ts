import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || 'lottery_pro_secret_key_change_in_production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

export type UserRole = 'store_owner' | 'super_admin' | 'store_account';

export interface TokenPayload {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
}

export interface DecodedToken extends TokenPayload {
  iat?: number;
  exp?: number;
}

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions);
};

export const verifyToken = (token: string): DecodedToken => {
  try {
    return jwt.verify(token, JWT_SECRET) as DecodedToken;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};
