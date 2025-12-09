import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ScanTicketRequest } from '../models/types';
import { authorizeStoreAccess, StoreAccessError } from '../utils/storeAccess';

interface ParsedScanPayload {
  lotteryNumber: string;
  ticketSerial: string;
  packNumber?: number;
  raw: string;
}

const parseScanInput = (payload: ScanTicketRequest): ParsedScanPayload => {
  if (payload.barcode_data) {
    const raw = payload.barcode_data.trim();

    if (raw.includes('-')) {
      const parts = raw.split('-');

      if (parts.length === 3) {
        const [lotteryNumber, ticketSerial, pack] = parts;
        const packNumber = parseInt(pack, 10);

        if (lotteryNumber && ticketSerial && !isNaN(packNumber)) {
          return {
            lotteryNumber,
            ticketSerial,
            packNumber,
            raw,
          };
        }
      }

      throw new Error('Invalid barcode format. Expected XXX-YYYYYY-ZZZ');
    }

    const numeric = raw.replace(/\s+/g, '');
    if (!/^\d+$/.test(numeric) || numeric.length < 12) {
      throw new Error(
        'Invalid barcode format. Expected digits string with at least 12 characters'
      );
    }

    const lotteryNumber = numeric.substring(0, 3);
    const ticketSerial = numeric.substring(3, 9);
    const packSegment = numeric.substring(9, 12);
    const packNumber = parseInt(packSegment, 10);

    return {
      lotteryNumber,
      ticketSerial,
      packNumber: isNaN(packNumber) ? undefined : packNumber,
      raw,
    };
  }

  if (
    payload.lottery_number &&
    payload.ticket_serial &&
    payload.pack_number !== undefined
  ) {
    const packNumber = Number(payload.pack_number);

    if (isNaN(packNumber)) {
      throw new Error('pack_number must be a number');
    }

    return {
      lotteryNumber: payload.lottery_number,
      ticketSerial: payload.ticket_serial,
      packNumber,
      raw: `${payload.lottery_number}-${payload.ticket_serial}-${packNumber}`,
    };
  }

  throw new Error(
    'Provide either barcode_data or lottery_number, ticket_serial, and pack_number'
  );
};

const calculateTotalTickets = (startNumber: number, endNumber: number): number => {
  return Math.abs(endNumber - startNumber) + 1;
};

const calculateSoldCount = (
  startNumber: number,
  endNumber: number,
  packNumber: number
): number => {
  const totalTickets = calculateTotalTickets(startNumber, endNumber);
  let sold: number;

  if (startNumber <= endNumber) {
    sold = packNumber - startNumber;
  } else {
    sold = startNumber - packNumber;
  }

  if (sold < 0) sold = 0;
  if (sold > totalTickets) sold = totalTickets;

  return sold;
};

export const scanTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { store_id }: ScanTicketRequest = req.body;

    if (!store_id) {
      res.status(400).json({ error: 'Store ID is required' });
      return;
    }

    await authorizeStoreAccess(store_id, req.user);

    let parsedScan: ParsedScanPayload;

    try {
      parsedScan = parseScanInput(req.body);
    } catch (parseError) {
      res.status(400).json({ error: (parseError as Error).message });
      return;
    }

    const [lotteryRows] = await pool.query(
      `SELECT lottery_id, lottery_name, lottery_number, price, launch_date, state, start_number, end_number, status, image_url
       FROM LOTTERY_MASTER WHERE lottery_number = ?`,
      [parsedScan.lotteryNumber]
    );

    if ((lotteryRows as any[]).length === 0) {
      res.status(200).json({
        status: 'ok',
        game_active: false,
        reason: 'not_found',
        lottery_number: parsedScan.lotteryNumber,
      });
      return;
    }

    const master = (lotteryRows as any[])[0];

    if (master.status !== 'active') {
      res.status(200).json({
        status: 'ok',
        game_active: false,
        reason: 'inactive_in_master',
        lottery_number: parsedScan.lotteryNumber,
      });
      return;
    }

    const totalTicketsFromMaster = calculateTotalTickets(
      master.start_number,
      master.end_number
    );
    const totalTickets = totalTicketsFromMaster;

    let soldCount = 0;
    if (parsedScan.packNumber !== undefined) {
      soldCount = calculateSoldCount(
        master.start_number,
        master.end_number,
        parsedScan.packNumber
      );
    }

    const resolveStatus = (current: number, total: number): 'inactive' | 'active' | 'finished' => {
      if (current >= total) return 'finished';
      if (current > 0) return 'active';
      return 'inactive';
    };

    const [inventoryRows] = await pool.query(
      `SELECT * FROM STORE_LOTTERY_INVENTORY
       WHERE store_id = ? AND lottery_id = ? AND serial_number = ?`,
      [store_id, master.lottery_id, parsedScan.ticketSerial]
    );

    let inventory;

    if ((inventoryRows as any[]).length === 0) {
      const initialSold = parsedScan.packNumber !== undefined ? soldCount : 0;
      const inventoryStatus = resolveStatus(initialSold, totalTickets);
      const [insertResult] = await pool.query(
        `INSERT INTO STORE_LOTTERY_INVENTORY
          (store_id, lottery_id, serial_number, total_count, current_count, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          store_id,
          master.lottery_id,
          parsedScan.ticketSerial,
          totalTickets,
          initialSold,
          inventoryStatus,
        ]
      );

      const newId = (insertResult as any).insertId;
      const [newInventory] = await pool.query(
        'SELECT * FROM STORE_LOTTERY_INVENTORY WHERE id = ?',
        [newId]
      );
      inventory = (newInventory as any[])[0];
    } else {
      inventory = (inventoryRows as any[])[0];

      let newSoldCount = inventory.current_count;
      if (parsedScan.packNumber !== undefined) {
        newSoldCount = soldCount;
      }

      const inventoryStatus = resolveStatus(newSoldCount, totalTickets);

      await pool.query(
        `UPDATE STORE_LOTTERY_INVENTORY
         SET total_count = ?,
             current_count = ?,
             status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [totalTickets, newSoldCount, inventoryStatus, inventory.id]
      );

      const [updatedInventory] = await pool.query(
        'SELECT * FROM STORE_LOTTERY_INVENTORY WHERE id = ?',
        [inventory.id]
      );
      inventory = (updatedInventory as any[])[0];
    }

    try {
      await pool.query(
        `INSERT INTO SCANNED_TICKETS (store_id, barcode_data, lottery_type_id, ticket_number, scanned_by)
         VALUES (?, ?, ?, ?, ?)`,
        [
          store_id,
          parsedScan.raw,
          master.lottery_id,
          parsedScan.packNumber,
          req.user?.id,
        ]
      );
    } catch (logError) {
      console.warn('Failed to log scan event:', logError);
    }

    const remainingTickets = Math.max(
      inventory.total_count - inventory.current_count,
      0
    );

    res.status(200).json({
      status: 'ok',
      game_active: true,
      lottery_master: {
        lottery_number: master.lottery_number,
        lottery_name: master.lottery_name,
        price: master.price,
        start_number: master.start_number,
        end_number: master.end_number,
        total_tickets: totalTickets,
        status: master.status,
        launch_date: master.launch_date,
        state: master.state,
        image_url: master.image_url,
      },
      inventory: {
        id: inventory.id,
        store_id,
        lottery_number: master.lottery_number,
        lottery_type_id: master.lottery_id,
        serial_number: inventory.serial_number,
        total_count: inventory.total_count,
        current_count: inventory.current_count,
        remaining_tickets: remainingTickets,
        status: inventory.status,
        updated_at: inventory.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Scan ticket error:', error);
    res.status(500).json({ error: 'Server error during ticket scan' });
  }
};

export const getScanHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const limit = parseInt(req.query.limit as string) || 50;

    await authorizeStoreAccess(storeId, req.user);

    const [result] = await pool.query(
      `SELECT
        st.*,
        lm.lottery_name as lottery_name,
        lm.price as lottery_price,
        u.full_name as scanned_by_name
      FROM SCANNED_TICKETS st
      LEFT JOIN LOTTERY_MASTER lm ON st.lottery_type_id = lm.lottery_id
      LEFT JOIN users u ON st.scanned_by = u.id
      WHERE st.store_id = ?
      ORDER BY st.scanned_at DESC
      LIMIT ?`,
      [storeId, limit]
    );

    res.status(200).json({ scanHistory: result });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Get scan history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
