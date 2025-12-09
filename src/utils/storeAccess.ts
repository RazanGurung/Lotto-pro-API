import { pool } from '../config/database';
import { DecodedToken } from './auth';

export class StoreAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface StoreAccessRecord {
  store_id: number;
  owner_id: number;
  store_name: string;
  state?: string;
}

export const authorizeStoreAccess = async (
  storeId: number,
  user?: DecodedToken
): Promise<StoreAccessRecord> => {
  if (!user) {
    throw new StoreAccessError(401, 'Unauthorized');
  }

  if (user.role === 'store_owner') {
    const [rows] = await pool.query(
      `SELECT store_id, owner_id, store_name, state
       FROM STORES
       WHERE store_id = ? AND owner_id = ?`,
      [storeId, user.id]
    );

    if ((rows as any[]).length === 0) {
      throw new StoreAccessError(404, 'Store not found');
    }

    return (rows as any[])[0];
  }

  if (user.role === 'store_account') {
    if (user.id !== storeId) {
      throw new StoreAccessError(403, 'Cannot access another store');
    }

    const [rows] = await pool.query(
      `SELECT store_id, owner_id, store_name, state
       FROM STORES
       WHERE store_id = ?`,
      [storeId]
    );

    if ((rows as any[]).length === 0) {
      throw new StoreAccessError(404, 'Store not found');
    }

    return (rows as any[])[0];
  }

  throw new StoreAccessError(
    403,
    'Store owner or store account access required'
  );
};
