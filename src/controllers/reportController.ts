import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { authorizeStoreAccess, StoreAccessError } from '../utils/storeAccess';

const REMAINING_TICKETS_SQL = `
  CASE
    WHEN sli.direction = 'desc' THEN LEAST(
      GREATEST(
        sli.current_count - LEAST(COALESCE(lm.start_number, 0), COALESCE(lm.end_number, 0)),
        0
      ),
      sli.total_count
    )
    ELSE LEAST(
      GREATEST(
        GREATEST(COALESCE(lm.start_number, 0), COALESCE(lm.end_number, 0)) - sli.current_count,
        0
      ),
      sli.total_count
    )
  END
`;

const normalizeDigits = (value?: string | null): string => {
  if (!value) return '';
  return value.replace(/\D/g, '');
};

const buildBarcodePrefix = (
  lotteryNumber?: string | null,
  serialNumber?: string | null
): string | null => {
  const prefix = normalizeDigits(`${lotteryNumber ?? ''}${serialNumber ?? ''}`);
  return prefix.length ? prefix : null;
};

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
        COALESCE(SUM(sli.total_count), 0) as total_tickets,
        COALESCE(SUM(${REMAINING_TICKETS_SQL}), 0) as available_tickets,
        COALESCE(SUM(sli.total_count), 0) - COALESCE(SUM(${REMAINING_TICKETS_SQL}), 0) as sold_tickets
      FROM STORE_LOTTERY_INVENTORY sli
      JOIN LOTTERY_MASTER lm ON sli.lottery_id = lm.lottery_id
      WHERE sli.store_id = ?`,
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
        ${REMAINING_TICKETS_SQL} as remaining_tickets,
        (sli.total_count - (${REMAINING_TICKETS_SQL})) as sold_count,
        (sli.total_count - (${REMAINING_TICKETS_SQL})) * lm.price as revenue
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
        lm.lottery_number,
        ${REMAINING_TICKETS_SQL} as remaining_tickets,
        (sli.total_count - (${REMAINING_TICKETS_SQL})) as sold_count,
        (sli.total_count - (${REMAINING_TICKETS_SQL})) * lm.price as revenue
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
        available: lottery.remaining_tickets,
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

const startOfDay = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const toSqlDateTime = (date: Date): string => {
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

interface ReportRange {
  start: Date;
  endExclusive: Date;
  label: string;
}

const resolveReportRange = (
  rangeParam?: string,
  dateParam?: string,
  startDateParam?: string,
  endDateParam?: string
): ReportRange => {
  const today = startOfDay(new Date());
  const normalizeDateInput = (input: string): Date => {
    const parts = input.split('-').map((part) => parseInt(part, 10));
    if (parts.length !== 3 || parts.some((n) => isNaN(n))) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }
    return new Date(parts[0], parts[1] - 1, parts[2]);
  };

  switch ((rangeParam || '').toLowerCase()) {
    case 'last7': {
      const start = addDays(today, -6);
      return { start, endExclusive: addDays(today, 1), label: 'last_7_days' };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      return { start, endExclusive: end, label: 'this_month' };
    }
    case 'custom': {
      if (!startDateParam || !endDateParam) {
        throw new Error('start_date and end_date are required for custom range');
      }
      const start = startOfDay(normalizeDateInput(startDateParam));
      const end = addDays(startOfDay(normalizeDateInput(endDateParam)), 1);
      if (end <= start) {
        throw new Error('end_date must be after start_date');
      }
      return { start, endExclusive: end, label: 'custom_range' };
    }
    case 'date': {
      if (!dateParam) {
        throw new Error('date parameter is required for date range');
      }
      const base = startOfDay(normalizeDateInput(dateParam));
      return { start: base, endExclusive: addDays(base, 1), label: 'specific_date' };
    }
    case 'today':
    default: {
      const base = dateParam ? startOfDay(normalizeDateInput(dateParam)) : today;
      return { start: base, endExclusive: addDays(base, 1), label: 'today' };
    }
  }
};

const fetchTicketSnapshot = async (
  storeId: number,
  lotteryId: number,
  prefix: string,
  prefixLength: number,
  boundarySql: string,
  params: (number | string)[]
): Promise<number | null> => {
  const [rows] = await pool.query(
    `SELECT st.ticket_number
     FROM SCANNED_TICKETS st
     WHERE st.store_id = ?
       AND st.lottery_type_id = ?
       AND LEFT(REPLACE(REPLACE(st.barcode_data, '-', ''), ' ', ''), ?) = ?
       AND ${boundarySql}
     ORDER BY st.scanned_at DESC, st.id DESC
     LIMIT 1`,
    [storeId, lotteryId, prefixLength, prefix, ...params]
  );

  const ticket = (rows as any[])[0]?.ticket_number;
  return typeof ticket === 'number' ? ticket : null;
};

export const getDailySalesReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const rangeParam = (req.query.range as string) || (req.query.date ? 'date' : 'today');
    const dateParam = req.query.date as string | undefined;
    const startDateParam = req.query.start_date as string | undefined;
    const endDateParam = req.query.end_date as string | undefined;

    let reportRange: ReportRange;
    try {
      reportRange = resolveReportRange(rangeParam, dateParam, startDateParam, endDateParam);
    } catch (rangeError) {
      res.status(400).json({ error: (rangeError as Error).message });
      return;
    }

    await authorizeStoreAccess(storeId, req.user);

    const startSql = toSqlDateTime(reportRange.start);
    const endSql = toSqlDateTime(reportRange.endExclusive);

    const [books] = await pool.query(
      `SELECT
        sli.id AS book_id,
        sli.serial_number,
        sli.direction,
        lm.lottery_id,
        lm.lottery_name,
        lm.lottery_number,
        lm.price,
        ${REMAINING_TICKETS_SQL} AS remaining_tickets
      FROM STORE_LOTTERY_INVENTORY sli
      JOIN LOTTERY_MASTER lm ON sli.lottery_id = lm.lottery_id
      WHERE sli.store_id = ?`,
      [storeId]
    );

    const breakdown: any[] = [];

    for (const book of books as any[]) {
      if (!book.direction || book.direction === 'unknown') {
        continue;
      }

      const prefix = buildBarcodePrefix(book.lottery_number, book.serial_number);
      if (!prefix) {
        continue;
      }

      const prefixLength = prefix.length;

      const [firstRows] = await pool.query(
        `SELECT st.ticket_number
         FROM SCANNED_TICKETS st
         WHERE st.store_id = ?
           AND st.lottery_type_id = ?
           AND st.scanned_at >= ?
           AND st.scanned_at < ?
           AND LEFT(REPLACE(REPLACE(st.barcode_data, '-', ''), ' ', ''), ?) = ?
         ORDER BY st.scanned_at ASC, st.id ASC
         LIMIT 1`,
        [storeId, book.lottery_id, startSql, endSql, prefixLength, prefix]
      );

      const [lastRows] = await pool.query(
        `SELECT st.id, st.ticket_number
         FROM SCANNED_TICKETS st
         WHERE st.store_id = ?
           AND st.lottery_type_id = ?
           AND st.scanned_at >= ?
           AND st.scanned_at < ?
           AND LEFT(REPLACE(REPLACE(st.barcode_data, '-', ''), ' ', ''), ?) = ?
         ORDER BY st.scanned_at DESC, st.id DESC
         LIMIT 1`,
        [storeId, book.lottery_id, startSql, endSql, prefixLength, prefix]
      );

      const [scansCountRows] = await pool.query(
        `SELECT COUNT(*) as scans_count
         FROM SCANNED_TICKETS st
         WHERE st.store_id = ?
           AND st.lottery_type_id = ?
           AND st.scanned_at >= ?
           AND st.scanned_at < ?
           AND LEFT(REPLACE(REPLACE(st.barcode_data, '-', ''), ' ', ''), ?) = ?`,
        [storeId, book.lottery_id, startSql, endSql, prefixLength, prefix]
      );

      const scansCount = Number((scansCountRows as any[])[0]?.scans_count || 0);

      const closingTicketRaw = (lastRows as any[])[0]?.ticket_number;
      const closingScanId = (lastRows as any[])[0]?.id ?? null;
      const firstTicketRaw = (firstRows as any[])[0]?.ticket_number;

      const previousTicket = await fetchTicketSnapshot(
        storeId,
        book.lottery_id,
        prefix,
        prefixLength,
        'st.scanned_at < ?',
        [startSql]
      );

      const closingTicket =
        typeof closingTicketRaw === 'number'
          ? closingTicketRaw
          : typeof previousTicket === 'number'
            ? previousTicket
            : null;

      if (closingTicket === null) {
        continue;
      }

      const openingTicket =
        typeof previousTicket === 'number'
          ? previousTicket
          : typeof firstTicketRaw === 'number'
            ? firstTicketRaw
            : closingTicket;

      let ticketsSold = 0;
      if (book.direction === 'asc') {
        ticketsSold = Math.max(0, closingTicket - openingTicket);
      } else {
        ticketsSold = Math.max(0, openingTicket - closingTicket);
      }

      const totalSales = ticketsSold * Number(book.price);

      const reportDateString = reportRange.start.toISOString().slice(0, 10);
      if (closingScanId) {
        try {
          await pool.query(
            `INSERT INTO DAILY_REPORT
              (store_id, lottery_id, book_id, scan_id, report_date, tickets_sold, total_sales)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               scan_id = VALUES(scan_id),
               tickets_sold = VALUES(tickets_sold),
               total_sales = VALUES(total_sales),
               updated_at = CURRENT_TIMESTAMP`,
            [
              storeId,
              book.lottery_id,
              book.book_id,
              closingScanId,
              reportDateString,
              ticketsSold,
              totalSales,
            ]
          );
        } catch (persistError) {
          console.warn('Failed to persist summary into DAILY_REPORT:', persistError);
        }
      }

      breakdown.push({
        book_id: book.book_id,
        lottery_id: book.lottery_id,
        serial_number: book.serial_number,
        direction: book.direction,
        lottery_name: book.lottery_name,
        lottery_number: book.lottery_number,
        price: book.price,
        opening_ticket: openingTicket,
        closing_ticket: closingTicket,
        tickets_sold: ticketsSold,
        total_sales: totalSales,
        scans_count: scansCount,
        remaining_tickets: Number(book.remaining_tickets),
      });
    }

    const totals = breakdown.reduce(
      (acc, row) => {
        acc.tickets += Number(row.tickets_sold) || 0;
        acc.revenue += Number(row.total_sales) || 0;
        return acc;
      },
      { tickets: 0, revenue: 0 }
    );

    res.status(200).json({
      store_id: storeId,
      range: reportRange.label,
      start: startSql,
      end: endSql,
      total_tickets_sold: totals.tickets,
      total_revenue: totals.revenue,
      breakdown,
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
