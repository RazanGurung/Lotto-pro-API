import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getLotteryTypes = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [result] = await pool.query(
      "SELECT lottery_id, lottery_name, lottery_number, price, launch_date, state, start_number, end_number, status, image_url FROM LOTTERY_MASTER WHERE status = 'active' ORDER BY price, lottery_name"
    );

    res.status(200).json({ lotteryTypes: result });
  } catch (error) {
    console.error('Get lottery types error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getStoreInventory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.storeId);

    // Verify store ownership
    const [storeCheck] = await pool.query(
      'SELECT * FROM STORES WHERE store_id = ? AND owner_id = ?',
      [storeId, userId]
    );

    if ((storeCheck as any[]).length === 0) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    // Get inventory with lottery type details
    const [result] = await pool.query(
      `SELECT
        sli.id,
        sli.store_id,
        sli.lottery_type_id,
        sli.serial_number,
        sli.total_count,
        sli.current_count,
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
      JOIN LOTTERY_MASTER lm ON sli.lottery_type_id = lm.lottery_id
      WHERE sli.store_id = ?
      ORDER BY lm.price, lm.lottery_name`,
      [storeId]
    );

    res.status(200).json({ inventory: result });
  } catch (error) {
    console.error('Get store inventory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getLotteryDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.storeId);
    const lotteryTypeId = parseInt(req.params.lotteryTypeId);

    // Verify store ownership
    const [storeCheck] = await pool.query(
      'SELECT * FROM STORES WHERE store_id = ? AND owner_id = ?',
      [storeId, userId]
    );

    if ((storeCheck as any[]).length === 0) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

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
      JOIN LOTTERY_MASTER lm ON sli.lottery_type_id = lm.lottery_id
      WHERE sli.store_id = ? AND sli.lottery_type_id = ?`,
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
    console.error('Get lottery detail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const updateInventory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.storeId);
    const lotteryTypeId = parseInt(req.params.lotteryTypeId);
    const { total_count, current_count } = req.body;

    // Verify store ownership
    const [storeCheck] = await pool.query(
      'SELECT * FROM STORES WHERE store_id = ? AND owner_id = ?',
      [storeId, userId]
    );

    if ((storeCheck as any[]).length === 0) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    // Update inventory
    await pool.query(
      `UPDATE STORE_LOTTERY_INVENTORY
      SET total_count = COALESCE(?, total_count),
          current_count = COALESCE(?, current_count),
          updated_at = CURRENT_TIMESTAMP
      WHERE store_id = ? AND lottery_type_id = ?`,
      [total_count, current_count, storeId, lotteryTypeId]
    );

    // Get updated inventory
    const [result] = await pool.query(
      'SELECT * FROM STORE_LOTTERY_INVENTORY WHERE store_id = ? AND lottery_type_id = ?',
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
    console.error('Update inventory error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
