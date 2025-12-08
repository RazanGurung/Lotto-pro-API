import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getStoreReport = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const store = (storeCheck as any[])[0];

    // Get inventory summary
    const [inventorySummary] = await pool.query(
      `SELECT
        COUNT(*) as total_lotteries,
        SUM(total_count) as total_tickets,
        SUM(current_count) as available_tickets,
        SUM(total_count - current_count) as sold_tickets
      FROM STORE_LOTTERY_INVENTORY
      WHERE store_id = ?`,
      [storeId]
    );

    // Get revenue by lottery type
    const [revenueByLottery] = await pool.query(
      `SELECT
        lm.lottery_id as id,
        lm.lottery_name,
        lm.price,
        lm.image_url,
        sli.total_count,
        sli.current_count,
        (sli.total_count - sli.current_count) as sold_count,
        (sli.total_count - sli.current_count) * lm.price as revenue
      FROM STORE_LOTTERY_INVENTORY sli
      JOIN LOTTERY_MASTER lm ON sli.lottery_id = lm.lottery_id
      WHERE sli.store_id = ?
      ORDER BY revenue DESC`,
      [storeId]
    );

    // Calculate total revenue
    const totalRevenue = (revenueByLottery as any[]).reduce(
      (sum, row) => sum + parseFloat(row.revenue),
      0
    );

    // Get recent scans
    const [recentScans] = await pool.query(
      `SELECT
        st.scanned_at,
        lm.lottery_name as lottery_name,
        lm.price,
        st.ticket_number
      FROM scanned_tickets st
      LEFT JOIN LOTTERY_MASTER lm ON st.lottery_type_id = lm.lottery_id
      WHERE st.store_id = ?
      ORDER BY st.scanned_at DESC
      LIMIT 20`,
      [storeId]
    );

    // Get sales by date (last 30 days)
    const [salesByDate] = await pool.query(
      `SELECT
        DATE(scanned_at) as date,
        COUNT(*) as tickets_sold,
        SUM(lm.price) as daily_revenue
      FROM scanned_tickets st
      LEFT JOIN LOTTERY_MASTER lm ON st.lottery_type_id = lm.lottery_id
      WHERE st.store_id = ?
        AND scanned_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(scanned_at)
      ORDER BY date DESC`,
      [storeId]
    );

    res.status(200).json({
      store,
      summary: {
        ...(inventorySummary as any[])[0],
        total_revenue: totalRevenue,
      },
      revenueByLottery,
      recentScans,
      salesByDate,
    });
  } catch (error) {
    console.error('Get store report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getLotteryReport = async (req: AuthRequest, res: Response): Promise<void> => {
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

    // Get lottery details
    const [lotteryResult] = await pool.query(
      `SELECT
        sli.*,
        lm.lottery_name,
        lm.price,
        lm.image_url,
        lm.start_number,
        lm.end_number,
        (sli.total_count - sli.current_count) as sold_count,
        (sli.total_count - sli.current_count) * lm.price as revenue
      FROM STORE_LOTTERY_INVENTORY sli
      JOIN LOTTERY_MASTER lm ON sli.lottery_id = lm.lottery_id
      WHERE sli.store_id = ? AND sli.lottery_type_id = ?`,
      [storeId, lotteryTypeId]
    );

    if ((lotteryResult as any[]).length === 0) {
      res.status(404).json({ error: 'Lottery not found in store inventory' });
      return;
    }

    const lottery = (lotteryResult as any[])[0];

    // Get sold tickets
    const [soldTickets] = await pool.query(
      `SELECT
        ticket_number,
        sold_date,
        customer_name
      FROM tickets
      WHERE inventory_id = ? AND sold = true
      ORDER BY sold_date DESC`,
      [lottery.id]
    );

    // Get available tickets
    const [availableTickets] = await pool.query(
      `SELECT ticket_number
      FROM tickets
      WHERE inventory_id = ? AND sold = false
      ORDER BY ticket_number`,
      [lottery.id]
    );

    res.status(200).json({
      lottery,
      soldTickets,
      availableTickets,
      statistics: {
        total_tickets: lottery.total_count,
        available: lottery.current_count,
        sold: lottery.sold_count,
        revenue: lottery.revenue,
        sell_through_rate: ((lottery.sold_count / lottery.total_count) * 100).toFixed(2) + '%',
      },
    });
  } catch (error) {
    console.error('Get lottery report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getSalesAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.storeId);
    const days = parseInt(req.query.days as string) || 30;

    // Verify store ownership
    const [storeCheck] = await pool.query(
      'SELECT * FROM STORES WHERE store_id = ? AND owner_id = ?',
      [storeId, userId]
    );

    if ((storeCheck as any[]).length === 0) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    // Sales by lottery type
    const [salesByType] = await pool.query(
      `SELECT
        lm.lottery_name,
        lm.price,
        COUNT(*) as tickets_sold,
        SUM(lm.price) as revenue
      FROM scanned_tickets st
      JOIN LOTTERY_MASTER lm ON st.lottery_type_id = lm.lottery_id
      WHERE st.store_id = ?
        AND st.scanned_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY lm.lottery_id, lm.lottery_name, lm.price
      ORDER BY revenue DESC`,
      [storeId, days]
    );

    // Sales by hour of day
    const [salesByHour] = await pool.query(
      `SELECT
        HOUR(scanned_at) as hour,
        COUNT(*) as tickets_sold
      FROM scanned_tickets
      WHERE store_id = ?
        AND scanned_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY hour
      ORDER BY hour`,
      [storeId, days]
    );

    // Sales by day of week
    const [salesByDayOfWeek] = await pool.query(
      `SELECT
        DAYNAME(scanned_at) as day_name,
        DAYOFWEEK(scanned_at) as day_number,
        COUNT(*) as tickets_sold
      FROM scanned_tickets
      WHERE store_id = ?
        AND scanned_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY day_name, day_number
      ORDER BY day_number`,
      [storeId, days]
    );

    res.status(200).json({
      period_days: days,
      salesByType,
      salesByHour,
      salesByDayOfWeek,
    });
  } catch (error) {
    console.error('Get sales analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
