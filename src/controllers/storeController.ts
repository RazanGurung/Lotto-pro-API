import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { CreateStoreRequest } from '../models/types';
import { authorizeStoreAccess, StoreAccessError } from '../utils/storeAccess';
import { hashPassword } from '../utils/auth';

const STORE_REMAINING_SQL = `
  CASE
    WHEN sli.direction = 'desc' THEN GREATEST(
      sli.total_count - LEAST(
        GREATEST(
          GREATEST(COALESCE(lm.start_number, 0), COALESCE(lm.end_number, 0)) - sli.current_count,
          0
        ),
        sli.total_count
      ),
      0
    )
    ELSE GREATEST(
      sli.total_count - LEAST(
        GREATEST(
          sli.current_count - LEAST(COALESCE(lm.start_number, 0), COALESCE(lm.end_number, 0)),
          0
        ),
        sli.total_count
      ),
      0
    )
  END
`;

export const getStores = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;

    const [result] = await pool.query(
      `SELECT
        s.store_id as id,
        s.owner_id,
        s.store_name,
        s.address,
        s.city,
        s.state,
        s.zipcode,
        s.lottery_ac_no,
        s.created_at,
        COUNT(sli.lottery_id) as lottery_count,
        COALESCE(SUM(${STORE_REMAINING_SQL}), 0) as total_active_tickets
      FROM STORES s
      LEFT JOIN STORE_LOTTERY_INVENTORY sli ON s.store_id = sli.store_id
      LEFT JOIN LOTTERY_MASTER lm ON sli.lottery_id = lm.lottery_id
      WHERE s.owner_id = ?
      GROUP BY s.store_id
      ORDER BY s.created_at DESC`,
      [userId]
    );

    res.status(200).json({ stores: result });
  } catch (error) {
    console.error('Get stores error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getStoreById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.id);

    const [result] = await pool.query(
      `SELECT
        store_id as id,
        owner_id,
        store_name,
        address,
        city,
        state,
        zipcode,
        lottery_ac_no,
        created_at
      FROM STORES WHERE store_id = ? AND owner_id = ?`,
      [storeId, userId]
    );

    if ((result as any[]).length === 0) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    res.status(200).json({ store: (result as any[])[0] });
  } catch (error) {
    console.error('Get store error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const createStore = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const {
      store_name,
      address,
      city,
      state,
      zipcode,
      lottery_ac_no,
      lottery_pw,
    }: CreateStoreRequest = req.body;

    if (!store_name || !lottery_ac_no || !lottery_pw) {
      res.status(400).json({
        error: 'Store name, lottery account number, and password are required',
      });
      return;
    }

    if (!isValidLotteryAccountNumber(lottery_ac_no)) {
      res
        .status(400)
        .json({ error: 'Lottery account number must be 8 digits' });
      return;
    }

    if (!isValidLotteryPin(lottery_pw)) {
      res.status(400).json({ error: 'Lottery password must be 4 digits' });
      return;
    }

    const [existing] = await pool.query(
      'SELECT store_id FROM STORES WHERE lottery_ac_no = ?',
      [lottery_ac_no]
    );

    if ((existing as any[]).length > 0) {
      res.status(400).json({ error: 'Lottery account number already exists' });
      return;
    }

    const hashedLotteryPassword = await hashPassword(lottery_pw);

    const [storeResult] = await pool.query(
      `INSERT INTO STORES
        (owner_id, store_name, address, city, state, zipcode, lottery_ac_no, lottery_pw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        store_name,
        address || null,
        city || null,
        state || null,
        zipcode || null,
        lottery_ac_no,
        hashedLotteryPassword,
      ]
    );

    const storeId = (storeResult as any).insertId;

    const [stores] = await pool.query(
      `SELECT
        store_id as id,
        owner_id,
        store_name,
        address,
        city,
        state,
        zipcode,
        lottery_ac_no,
        created_at
      FROM STORES WHERE store_id = ?`,
      [storeId]
    );
    const store = (stores as any[])[0];

    res.status(201).json({
      store,
      message: 'Store created successfully',
    });
  } catch (error) {
    console.error('Create store error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateStore = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.id);
    const {
      store_name,
      address,
      city,
      state,
      zipcode,
      lottery_ac_no,
      lottery_pw,
    } = req.body;

    const [checkResult] = await pool.query(
      'SELECT * FROM STORES WHERE store_id = ? AND owner_id = ?',
      [storeId, userId]
    );

    if ((checkResult as any[]).length === 0) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    if (lottery_ac_no) {
      if (!isValidLotteryAccountNumber(lottery_ac_no)) {
        res
          .status(400)
          .json({ error: 'Lottery account number must be 8 digits' });
        return;
      }

      const [existing] = await pool.query(
        'SELECT store_id FROM STORES WHERE lottery_ac_no = ? AND store_id != ?',
        [lottery_ac_no, storeId]
      );

      if ((existing as any[]).length > 0) {
        res
          .status(400)
          .json({ error: 'Lottery account number already in use' });
        return;
      }
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (store_name) {
      updates.push('store_name = ?');
      values.push(store_name);
    }
    if (address) {
      updates.push('address = ?');
      values.push(address);
    }
    if (city) {
      updates.push('city = ?');
      values.push(city);
    }
    if (state) {
      updates.push('state = ?');
      values.push(state);
    }
    if (zipcode) {
      updates.push('zipcode = ?');
      values.push(zipcode);
    }
    if (lottery_ac_no) {
      updates.push('lottery_ac_no = ?');
      values.push(lottery_ac_no);
    }
    if (lottery_pw) {
      if (!isValidLotteryPin(lottery_pw)) {
        res.status(400).json({ error: 'Lottery password must be 4 digits' });
        return;
      }

      const hashedLotteryPassword = await hashPassword(lottery_pw);
      updates.push('lottery_pw = ?');
      values.push(hashedLotteryPassword);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    await pool.query(
      `UPDATE STORES SET ${updates.join(
        ', '
      )} WHERE store_id = ? AND owner_id = ?`,
      [...values, storeId, userId]
    );

    const [result] = await pool.query(
      `SELECT
        store_id as id,
        owner_id,
        store_name,
        address,
        city,
        state,
        zipcode,
        lottery_ac_no,
        created_at,
        updated_at
      FROM STORES WHERE store_id = ?`,
      [storeId]
    );

    res.status(200).json({
      store: (result as any[])[0],
      message: 'Store updated successfully',
    });
  } catch (error) {
    console.error('Update store error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const deleteStore = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.id);

    // Clean related data
    const [inventories] = await pool.query(
      'SELECT id FROM STORE_LOTTERY_INVENTORY WHERE store_id = ?',
      [storeId]
    );

    const inventoryIds = (inventories as any[]).map((inv) => inv.id);

    if (inventoryIds.length > 0) {
      const placeholders = inventoryIds.map(() => '?').join(', ');
      await pool.query(
        `DELETE FROM tickets WHERE inventory_id IN (${placeholders})`,
        inventoryIds
      );
    }

    await pool.query('DELETE FROM STORE_LOTTERY_INVENTORY WHERE store_id = ?', [
      storeId,
    ]);
    await pool.query('DELETE FROM SCANNED_TICKETS WHERE store_id = ?', [
      storeId,
    ]);

    const [result] = await pool.query(
      'DELETE FROM STORES WHERE store_id = ? AND owner_id = ?',
      [storeId, userId]
    );

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    res.status(200).json({ message: 'Store deleted successfully' });
  } catch (error) {
    console.error('Delete store error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
const isValidLotteryAccountNumber = (value: string): boolean =>
  /^\d{8}$/.test(value);

const isValidLotteryPin = (value: string): boolean => /^\d{4}$/.test(value);

export const getClerkStoreDashboard = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const store = await authorizeStoreAccess(storeId, req.user);

    const [inventory] = await pool.query(
      `SELECT
        sli.id,
        sli.store_id,
        sli.lottery_id,
        sli.serial_number,
        sli.total_count,
        sli.current_count,
        ${STORE_REMAINING_SQL} AS remaining_tickets,
        sli.direction,
        sli.status,
        sli.created_at
      FROM STORE_LOTTERY_INVENTORY sli
      LEFT JOIN LOTTERY_MASTER lm ON sli.lottery_id = lm.lottery_id
      WHERE sli.store_id = ?
      ORDER BY sli.updated_at DESC`,
      [storeId]
    );

    res.status(200).json({
      store,
      inventory,
    });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Get clerk store dashboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
