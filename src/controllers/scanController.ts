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

    const parsedPayload: ParsedScanPayload = {
      lotteryNumber,
      ticketSerial,
      packNumber: isNaN(packNumber) ? undefined : packNumber,
      raw,
    };

    if (payload.ticket_number !== undefined) {
      const manualTicket = Number(payload.ticket_number);
      if (isNaN(manualTicket)) {
        throw new Error('ticket_number must be a number');
      }
      parsedPayload.packNumber = manualTicket;
    }

    return parsedPayload;
  }

  const directTicketNumber = payload.pack_number ?? payload.ticket_number;

  if (
    payload.lottery_number &&
    payload.ticket_serial &&
    directTicketNumber !== undefined
  ) {
    const packNumber = Number(directTicketNumber);

    if (isNaN(packNumber)) {
      throw new Error('ticket number must be a number');
    }

    return {
      lotteryNumber: payload.lottery_number,
      ticketSerial: payload.ticket_serial,
      packNumber,
      raw: `${payload.lottery_number}-${payload.ticket_serial}-${packNumber}`,
    };
  }

  throw new Error(
    'Provide either barcode_data or lottery_number, ticket_serial, and ticket_number'
  );
};

const calculateTotalTickets = (
  startNumber: number,
  endNumber: number
): number => {
  return Math.abs(endNumber - startNumber) + 1;
};

type DirectionValue = 'asc' | 'desc';

const parseDirectionInput = (value?: string): DirectionValue | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'asc' || normalized === 'desc') {
    return normalized;
  }
  throw new Error('Direction must be either "asc" or "desc"');
};

const normalizeDigits = (value: string): string => value.replace(/\D/g, '');

const buildBookDigitsPrefix = (
  payload: ParsedScanPayload,
  lotteryNumber?: string,
  inventorySerial?: string | null
): string | null => {
  const canonical = normalizeDigits(
    `${lotteryNumber ?? ''}${inventorySerial ?? ''}`
  );
  if (canonical) {
    return canonical;
  }

  const baseDigits = normalizeDigits(payload.raw);
  const expectedLength =
    (payload.lotteryNumber?.length || 0) +
    (payload.ticketSerial?.length || 0);

  if (expectedLength === 0) {
    return baseDigits || null;
  }

  if (baseDigits.length >= expectedLength) {
    return baseDigits.substring(0, expectedLength);
  }

  const fallback = normalizeDigits(
    `${payload.lotteryNumber ?? ''}${payload.ticketSerial ?? ''}`
  );

  return fallback || baseDigits || null;
};

const computeTicketDelta = (
  previousTicket: number | null,
  currentTicket: number,
  direction: DirectionValue
): number => {
  if (previousTicket === null || isNaN(previousTicket)) {
    return 0;
  }

  if (direction === 'asc') {
    if (currentTicket < previousTicket) {
      throw new Error('Scanned ticket number moved backwards for an ascending book');
    }
    return currentTicket - previousTicket;
  }

  if (currentTicket > previousTicket) {
    throw new Error('Scanned ticket number moved forwards for a descending book');
  }
  return previousTicket - currentTicket;
};

const computeRemainingInventory = (
  startNumber: number,
  endNumber: number,
  currentTicket: number,
  direction: DirectionValue | undefined
): number => {
  const minTicket = Math.min(startNumber, endNumber);
  const maxTicket = Math.max(startNumber, endNumber);
  const totalTickets = calculateTotalTickets(startNumber, endNumber);

  let soldTickets: number;
  if (direction === 'desc') {
    soldTickets = Math.max(0, maxTicket - currentTicket);
  } else {
    soldTickets = Math.max(0, currentTicket - minTicket);
  }

  const clampedSold = Math.min(soldTickets, totalTickets);
  return Math.max(totalTickets - clampedSold, 0);
};

const assertDirectionBounds = (
  ticketNumber: number,
  direction: DirectionValue | undefined,
  startNumber: number,
  endNumber: number
): void => {
  if (!direction) return;
  if (ticketNumber < startNumber || ticketNumber > endNumber) {
    throw new Error('Ticket number is outside the valid range for this book');
  }
  if (direction === 'desc' && ticketNumber < startNumber) {
    throw new Error('Descending books cannot scan below the start number');
  }
  if (direction === 'asc' && ticketNumber > endNumber) {
    throw new Error('Ascending books cannot scan past the end number');
  }
};

const resolveStatus = (
  remaining: number
): 'inactive' | 'active' | 'finished' => {
  if (remaining <= 0) return 'finished';
  return 'active';
};

export const scanTicket = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
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

    let directionInput: DirectionValue | undefined;
    try {
      directionInput = parseDirectionInput(req.body.direction);
    } catch (dirError) {
      res.status(400).json({ error: (dirError as Error).message });
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

    const totalTickets = calculateTotalTickets(
      master.start_number,
      master.end_number
    );
    const saleAmountPerTicket = Number(master.price) || 0;

    if (parsedScan.packNumber === undefined) {
      res.status(400).json({
        error: 'Ticket number is required in the scan payload',
      });
      return;
    }

    const currentTicketNumber = parsedScan.packNumber;
    const minTicket = Math.min(master.start_number, master.end_number);
    const maxTicket = Math.max(master.start_number, master.end_number);

    if (currentTicketNumber < minTicket || currentTicketNumber > maxTicket) {
      res.status(400).json({ error: 'Ticket number is outside the valid range' });
      return;
    }

    const [inventoryRows] = await pool.query(
      `SELECT * FROM STORE_LOTTERY_INVENTORY
       WHERE store_id = ? AND lottery_id = ? AND serial_number = ?`,
      [store_id, master.lottery_id, parsedScan.ticketSerial]
    );

    let inventoryRecord: any;
    let ticketsSoldThisScan = 0;

    if ((inventoryRows as any[]).length === 0) {
      if (!directionInput) {
        res.status(400).json({
          error: 'Direction is required for the first scan of a book',
        });
        return;
      }
      try {
        assertDirectionBounds(
          currentTicketNumber,
          directionInput,
          minTicket,
          maxTicket
        );
      } catch (boundsError) {
        res.status(400).json({ error: (boundsError as Error).message });
        return;
      }

      const remainingInventory = computeRemainingInventory(
        master.start_number,
        master.end_number,
        currentTicketNumber,
        directionInput
      );
      const inventoryStatus = resolveStatus(remainingInventory);
      const [insertResult] = await pool.query(
        `INSERT INTO STORE_LOTTERY_INVENTORY
          (store_id, lottery_id, serial_number, total_count, current_count, status, direction)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          store_id,
          master.lottery_id,
          parsedScan.ticketSerial,
          totalTickets,
          currentTicketNumber,
          inventoryStatus,
          directionInput,
        ]
      );

      const newId = (insertResult as any).insertId;
      const [newInventory] = await pool.query(
        'SELECT * FROM STORE_LOTTERY_INVENTORY WHERE id = ?',
        [newId]
      );
      inventoryRecord = (newInventory as any[])[0];
    } else {
      const currentInventory = (inventoryRows as any[])[0];
      const storedDirection =
        currentInventory.direction === 'asc' || currentInventory.direction === 'desc'
          ? (currentInventory.direction as DirectionValue)
          : 'unknown';

      let directionToUse: DirectionValue;

      if (storedDirection === 'unknown') {
        if (!directionInput) {
          res.status(400).json({
            error: 'Direction is required for this book before scanning',
          });
          return;
        }
        directionToUse = directionInput;
      } else {
        if (directionInput && directionInput !== storedDirection) {
          res.status(400).json({
            error: `Book direction already set to "${storedDirection}".`,
          });
          return;
        }
        directionToUse = storedDirection;
      }

      try {
        assertDirectionBounds(
          currentTicketNumber,
          directionToUse,
          minTicket,
          maxTicket
        );
      } catch (boundsError) {
        res.status(400).json({ error: (boundsError as Error).message });
        return;
      }

      const previousTicketNumberRaw = Number(currentInventory.current_count);
      const previousTicketNumber = isNaN(previousTicketNumberRaw)
        ? null
        : previousTicketNumberRaw;
      if (
        directionToUse === 'asc' &&
        previousTicketNumber !== null &&
        previousTicketNumber >= maxTicket
      ) {
        res.status(400).json({ error: 'All tickets have already been sold for this book' });
        return;
      }
      if (
        directionToUse === 'desc' &&
        previousTicketNumber !== null &&
        previousTicketNumber <= minTicket
      ) {
        res.status(400).json({ error: 'All tickets have already been sold for this book' });
        return;
      }
      let computedDelta = 0;
      try {
        computedDelta = computeTicketDelta(
          previousTicketNumber,
          currentTicketNumber,
          directionToUse
        );
      } catch (movementError) {
        res.status(400).json({ error: (movementError as Error).message });
        return;
      }
      ticketsSoldThisScan = computedDelta;

      const remainingInventory = computeRemainingInventory(
        master.start_number,
        master.end_number,
        currentTicketNumber,
        directionToUse
      );

      const inventoryStatus = resolveStatus(remainingInventory);

      await pool.query(
        `UPDATE STORE_LOTTERY_INVENTORY
         SET total_count = ?,
             current_count = ?,
             status = ?,
             direction = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          totalTickets,
          currentTicketNumber,
          inventoryStatus,
          directionToUse,
          currentInventory.id,
        ]
      );

      const [updatedInventory] = await pool.query(
        'SELECT * FROM STORE_LOTTERY_INVENTORY WHERE id = ?',
        [currentInventory.id]
      );
      inventoryRecord = (updatedInventory as any[])[0];
    }

    const inventory = inventoryRecord;
    if (!inventory) {
      throw new Error('Failed to load inventory record');
    }

    const resolvedDirection =
      inventory.direction === 'asc' || inventory.direction === 'desc'
        ? (inventory.direction as DirectionValue)
        : undefined;

    const scannedBy = req.user?.id ?? null;
    let scanLogId: number | null = null;

    try {
      const [scanResult] = await pool.query(
        `INSERT INTO SCANNED_TICKETS (store_id, barcode_data, lottery_type_id, ticket_number, scanned_by)
         VALUES (?, ?, ?, ?, ?)`,
        [
          store_id,
          parsedScan.raw,
          master.lottery_id,
          parsedScan.packNumber,
          scannedBy,
        ]
      );
      scanLogId = (scanResult as any).insertId;
    } catch (logError) {
      console.warn('Failed to log scan event:', logError);
    }

    if (scanLogId && ticketsSoldThisScan > 0) {
      const salesIncrement = ticketsSoldThisScan * saleAmountPerTicket;

      try {
        await pool.query(
          `INSERT INTO DAILY_REPORT
            (store_id, lottery_id, book_id, scan_id, report_date, tickets_sold, total_sales)
           VALUES (?, ?, ?, ?, CURDATE(), ?, ?)
           ON DUPLICATE KEY UPDATE
             scan_id = VALUES(scan_id),
             tickets_sold = tickets_sold + VALUES(tickets_sold),
             total_sales = total_sales + VALUES(total_sales),
             updated_at = CURRENT_TIMESTAMP`,
          [
            store_id,
            master.lottery_id,
            inventory.id,
            scanLogId,
            ticketsSoldThisScan,
            salesIncrement,
          ]
        );
      } catch (reportError) {
        console.warn('Failed to persist daily report entry:', reportError);
      }
    }

    const currentTicketValue = Number(inventory.current_count);
    const remainingTickets = isNaN(currentTicketValue)
      ? null
      : computeRemainingInventory(
          master.start_number,
          master.end_number,
          currentTicketValue,
          resolvedDirection
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
        direction: inventory.direction,
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

export const getScanHistory = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId);
    const limit = parseInt(req.query.limit as string) || 50;

    await authorizeStoreAccess(storeId, req.user);

    const [result] = await pool.query(
      `SELECT
        st.*,
        lm.lottery_name as lottery_name,
        lm.price as lottery_price,
        COALESCE(so.name, sc.store_name) as scanned_by_name,
        CASE
          WHEN so.owner_id IS NOT NULL THEN 'store_owner'
          WHEN sc.store_id IS NOT NULL THEN 'store_account'
          ELSE NULL
        END as scanned_by_role
      FROM SCANNED_TICKETS st
      LEFT JOIN LOTTERY_MASTER lm ON st.lottery_type_id = lm.lottery_id
      LEFT JOIN STORE_OWNER so ON st.scanned_by = so.owner_id
      LEFT JOIN STORES sc ON st.scanned_by = sc.store_id
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
