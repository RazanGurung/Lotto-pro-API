import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { authorizeStoreAccess, StoreAccessError } from '../utils/storeAccess';

export const getLotteryTypes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeId = Number(req.params.storeId);
    if (isNaN(storeId)) {
      res.status(400).json({ error: 'storeId must be a number' });
      return;
    }

    const store = await authorizeStoreAccess(storeId, req.user);
    const storeState = store.state;

    const [result] = storeState
      ? await pool.query(
          "SELECT lottery_id, lottery_name, lottery_number, price, launch_date, state, start_number, end_number, status, image_url FROM LOTTERY_MASTER WHERE status = 'active' AND state = ? ORDER BY price, lottery_name",
          [storeState]
        )
      : await pool.query(
          "SELECT lottery_id, lottery_name, lottery_number, price, launch_date, state, start_number, end_number, status, image_url FROM LOTTERY_MASTER WHERE status = 'active' ORDER BY price, lottery_name"
        );

    res.status(200).json({ lotteryTypes: result });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Get lottery types error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getStoreInventory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);

    await authorizeStoreAccess(storeId, req.user);

    // Get inventory with lottery type details
    const [result] = await pool.query(
      `SELECT
        id,
        store_id,
        lottery_id,
        serial_number,
        total_count,
        current_count,
        direction,
        status,
        created_at
      FROM STORE_LOTTERY_INVENTORY
      WHERE store_id = ?
      ORDER BY updated_at DESC`,
      [storeId]
    );

    res.status(200).json({ inventory: result });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Get store inventory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getLotteryDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const lotteryTypeId = parseInt(req.params.lotteryTypeId);

    await authorizeStoreAccess(storeId, req.user);

    // Get inventory details
    const [inventoryResult] = await pool.query(
      `SELECT
        sli.*,
        sli.serial_number,
        lm.lottery_name,
        lm.lottery_number,
        lm.price,
        lm.launch_date,
        lm.state,
        lm.image_url,
        lm.start_number,
        lm.end_number,
        lm.status
      FROM STORE_LOTTERY_INVENTORY sli
      JOIN LOTTERY_MASTER lm ON sli.lottery_id = lm.lottery_id
      WHERE sli.store_id = ? AND sli.lottery_id = ?`,
      [storeId, lotteryTypeId]
    );

    if ((inventoryResult as any[]).length === 0) {
      res.status(404).json({ error: 'Lottery inventory not found' });
      return;
    }

    const inventory = (inventoryResult as any[])[0];

    // Get tickets for this lottery
    const [ticketsResult] = await pool.query(
      `SELECT
        ticket_number,
        sold,
        sold_date,
        customer_name
      FROM tickets
      WHERE inventory_id = ?
      ORDER BY ticket_number`,
      [inventory.id]
    );

    res.status(200).json({
      lottery: inventory,
      tickets: ticketsResult,
    });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Get lottery detail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateInventory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const lotteryTypeId = parseInt(req.params.lotteryTypeId);
    const { total_count, current_count } = req.body;

    await authorizeStoreAccess(storeId, req.user);

    if (req.user?.role !== 'store_owner') {
      res.status(403).json({ error: 'Only store owners can update inventory' });
      return;
    }

    // Update inventory
    await pool.query(
      `UPDATE STORE_LOTTERY_INVENTORY
      SET total_count = COALESCE(?, total_count),
          current_count = COALESCE(?, current_count),
          updated_at = CURRENT_TIMESTAMP
      WHERE store_id = ? AND lottery_id = ?`,
      [total_count, current_count, storeId, lotteryTypeId]
    );

    // Get updated inventory
    const [result] = await pool.query(
      'SELECT * FROM STORE_LOTTERY_INVENTORY WHERE store_id = ? AND lottery_id = ?',
      [storeId, lotteryTypeId]
    );

    if ((result as any[]).length === 0) {
      res.status(404).json({ error: 'Inventory not found' });
      return;
    }

    res.status(200).json({
      inventory: (result as any[])[0],
      message: 'Inventory updated successfully',
    });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Update inventory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
