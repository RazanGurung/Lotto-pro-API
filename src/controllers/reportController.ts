import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { authorizeStoreAccess, StoreAccessError } from '../utils/storeAccess';

const ensureStoreOwnership = async (
  storeId: number,
  ownerId?: number
): Promise<any> => {
  const [storeRows] = await pool.query(
    'SELECT * FROM STORES WHERE store_id = ? AND owner_id = ?',
    [storeId, ownerId]
  );

  if ((storeRows as any[]).length === 0) {
    throw new Error('STORE_NOT_FOUND');
  }

  return (storeRows as any[])[0];
};

export const getStoreReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.storeId);

    const store = await ensureStoreOwnership(storeId, userId);

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
      FROM SCANNED_TICKETS st
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
      FROM SCANNED_TICKETS st
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
    if (error instanceof Error && error.message === 'STORE_NOT_FOUND') {
      res.status(404).json({ error: 'Store not found' });
      return;
    }
    console.error('Get store report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getLotteryReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.storeId);
    const lotteryTypeId = parseInt(req.params.lotteryTypeId);

    await ensureStoreOwnership(storeId, userId);

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
      WHERE sli.store_id = ? AND sli.lottery_id = ?`,
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
    if (error instanceof Error && error.message === 'STORE_NOT_FOUND') {
      res.status(404).json({ error: 'Store not found' });
      return;
    }
    console.error('Get lottery report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getSalesAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.storeId);
    const days = parseInt(req.query.days as string) || 30;

    await ensureStoreOwnership(storeId, userId);

    // Sales by lottery type
    const [salesByType] = await pool.query(
      `SELECT
        lm.lottery_name,
        lm.price,
        COUNT(*) as tickets_sold,
        SUM(lm.price) as revenue
      FROM SCANNED_TICKETS st
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
      FROM SCANNED_TICKETS
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
      FROM SCANNED_TICKETS
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
    if (error instanceof Error && error.message === 'STORE_NOT_FOUND') {
      res.status(404).json({ error: 'Store not found' });
      return;
    }
    console.error('Get sales analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getDailySalesReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const dateParam = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    await authorizeStoreAccess(storeId, req.user);

    const [reports] = await pool.query(
      `SELECT
        dr.report_id,
        dr.lottery_id,
        dr.book_id,
        dr.scan_id,
        dr.report_date,
        dr.opening_ticket,
        dr.closing_ticket,
        dr.tickets_sold,
        dr.total_sales,
        lm.lottery_name,
        lm.lottery_number,
        sli.serial_number
      FROM DAILY_REPORT dr
      JOIN LOTTERY_MASTER lm ON dr.lottery_id = lm.lottery_id
      JOIN STORE_LOTTERY_INVENTORY sli ON dr.book_id = sli.id
      WHERE dr.store_id = ?
        AND dr.report_date = ?
      ORDER BY lm.lottery_name`,
      [storeId, dateParam]
    );

    const totals = (reports as any[]).reduce(
      (acc, row) => {
        acc.tickets += Number(row.tickets_sold) || 0;
        acc.revenue += Number(row.total_sales) || 0;
        return acc;
      },
      { tickets: 0, revenue: 0 }
    );

    res.status(200).json({
      store_id: storeId,
      date: dateParam,
      total_tickets_sold: totals.tickets,
      total_revenue: totals.revenue,
      breakdown: reports,
    });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Get daily sales report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getTicketScanLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const dateFilter = req.query.date as string | undefined;
    const limit = Math.min(
      Math.max(parseInt((req.query.limit as string) || '100', 10) || 100, 1),
      500
    );

    if (dateFilter && !/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    await authorizeStoreAccess(storeId, req.user);

    let query = `
      SELECT
        st.id as scan_id,
        st.ticket_number,
        st.scanned_at as scan_date,
        st.barcode_data,
        lm.lottery_name,
        lm.lottery_number,
        lm.price
      FROM SCANNED_TICKETS st
      JOIN LOTTERY_MASTER lm ON st.lottery_type_id = lm.lottery_id
      WHERE st.store_id = ?`;
    const params: Array<number | string> = [storeId];

    if (dateFilter) {
      query += ' AND DATE(st.scanned_at) = ?';
      params.push(dateFilter);
    }

    query += ' ORDER BY st.scanned_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(query, params);

    res.status(200).json({ scan_logs: rows });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Get ticket scan logs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getMonthlySalesReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const monthParam =
      (req.query.month as string) || new Date().toISOString().slice(0, 7);

    if (!/^\d{4}-\d{2}$/.test(monthParam)) {
      res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
      return;
    }

    await authorizeStoreAccess(storeId, req.user);

    const monthStart = `${monthParam}-01`;

    const [dailyTotals] = await pool.query(
      `SELECT
        dr.report_date,
        SUM(dr.tickets_sold) as tickets_sold,
        SUM(dr.total_sales) as revenue
      FROM DAILY_REPORT dr
      WHERE dr.store_id = ?
        AND dr.report_date >= ?
        AND dr.report_date < DATE_ADD(?, INTERVAL 1 MONTH)
      GROUP BY dr.report_date
      ORDER BY dr.report_date`,
      [storeId, monthStart, monthStart]
    );

    const [lotteryTotals] = await pool.query(
      `SELECT
        dr.lottery_id,
        lm.lottery_name,
        lm.lottery_number,
        SUM(dr.tickets_sold) as tickets_sold,
        SUM(dr.total_sales) as revenue
      FROM DAILY_REPORT dr
      JOIN LOTTERY_MASTER lm ON dr.lottery_id = lm.lottery_id
      WHERE dr.store_id = ?
        AND dr.report_date >= ?
        AND dr.report_date < DATE_ADD(?, INTERVAL 1 MONTH)
      GROUP BY dr.lottery_id, lm.lottery_name, lm.lottery_number
      ORDER BY revenue DESC`,
      [storeId, monthStart, monthStart]
    );

    const totals = (lotteryTotals as any[]).reduce(
      (acc, row) => {
        acc.tickets += Number(row.tickets_sold) || 0;
        acc.revenue += Number(row.revenue) || 0;
        return acc;
      },
      { tickets: 0, revenue: 0 }
    );

    res.status(200).json({
      store_id: storeId,
      month: monthParam,
      total_tickets_sold: totals.tickets,
      total_revenue: totals.revenue,
      daily_totals: dailyTotals,
      lottery_totals: lotteryTotals,
    });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Get monthly sales report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
