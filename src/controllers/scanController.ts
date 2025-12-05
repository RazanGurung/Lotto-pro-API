import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { ScanTicketRequest, DecodedBarcodeData } from '../models/types';

// Decode barcode data (simple implementation - can be enhanced)
const decodeBarcode = (barcodeData: string): DecodedBarcodeData => {
  try {
    // Example barcode format: "LT-{lottery_type_id}-{ticket_number}"
    // e.g., "LT-1-42" means Lottery Type 1, Ticket #42

    const parts = barcodeData.split('-');

    if (parts.length === 3 && parts[0] === 'LT') {
      const lottery_type_id = parseInt(parts[1]);
      const ticket_number = parseInt(parts[2]);

      if (!isNaN(lottery_type_id) && !isNaN(ticket_number)) {
        return {
          lottery_type_id,
          ticket_number,
          isValid: true,
          raw: barcodeData,
        };
      }
    }

    return {
      isValid: false,
      raw: barcodeData,
      error: 'Invalid barcode format',
    };
  } catch (error) {
    return {
      isValid: false,
      raw: barcodeData,
      error: 'Failed to decode barcode',
    };
  }
};

export const scanTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { barcode_data, store_id }: ScanTicketRequest = req.body;

    if (!barcode_data || !store_id) {
      res.status(400).json({ error: 'Barcode data and store ID are required' });
      return;
    }

    // Verify store ownership
    const [storeCheck] = await pool.query(
      'SELECT * FROM stores WHERE store_id = ? AND owner_id = ?',
      [store_id, userId]
    );

    if ((storeCheck as any[]).length === 0) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    // Decode barcode
    const decoded = decodeBarcode(barcode_data);

    if (!decoded.isValid) {
      // Log the scan attempt even if invalid
      await pool.query(
        'INSERT INTO scanned_tickets (store_id, barcode_data, scanned_by) VALUES (?, ?, ?)',
        [store_id, barcode_data, userId]
      );

      res.status(400).json({
        error: 'Invalid barcode',
        decoded,
      });
      return;
    }

    // Get inventory for this lottery type in this store
    const [inventoryResult] = await pool.query(
      `SELECT sli.*, lt.name, lt.price
      FROM store_lottery_inventory sli
      JOIN lottery_types lt ON sli.lottery_type_id = lt.id
      WHERE sli.store_id = ? AND sli.lottery_type_id = ?`,
      [store_id, decoded.lottery_type_id]
    );

    if ((inventoryResult as any[]).length === 0) {
      res.status(404).json({
        error: 'Lottery type not found in store inventory',
        decoded,
      });
      return;
    }

    const inventory = (inventoryResult as any[])[0];

    // Check if ticket already exists
    let [ticketResult] = await pool.query(
      'SELECT * FROM tickets WHERE inventory_id = ? AND ticket_number = ?',
      [inventory.id, decoded.ticket_number]
    );

    let ticket;
    let isNewTicket = false;

    if ((ticketResult as any[]).length === 0) {
      // Create new ticket and mark as sold
      const [insertResult] = await pool.query(
        `INSERT INTO tickets (inventory_id, ticket_number, sold, sold_date, barcode)
        VALUES (?, ?, true, CURRENT_TIMESTAMP, ?)`,
        [inventory.id, decoded.ticket_number, barcode_data]
      );

      const insertId = (insertResult as any).insertId;
      const [newTicket] = await pool.query('SELECT * FROM tickets WHERE id = ?', [insertId]);
      ticket = (newTicket as any[])[0];
      isNewTicket = true;

      // Decrease current count
      await pool.query(
        'UPDATE store_lottery_inventory SET current_count = current_count - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [inventory.id]
      );
    } else {
      ticket = (ticketResult as any[])[0];

      if (ticket.sold) {
        res.status(400).json({
          error: 'Ticket already scanned',
          ticket,
          decoded,
        });
        return;
      }

      // Mark ticket as sold
      await pool.query(
        `UPDATE tickets
        SET sold = true,
            sold_date = CURRENT_TIMESTAMP,
            barcode = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [barcode_data, ticket.id]
      );

      // Decrease current count
      await pool.query(
        'UPDATE store_lottery_inventory SET current_count = current_count - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [inventory.id]
      );
    }

    // Log the scan
    await pool.query(
      `INSERT INTO scanned_tickets (store_id, ticket_id, barcode_data, lottery_type_id, ticket_number, scanned_by)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [store_id, ticket.id, barcode_data, decoded.lottery_type_id, decoded.ticket_number, userId]
    );

    // Get updated inventory
    const [updatedInventoryResult] = await pool.query(
      'SELECT * FROM store_lottery_inventory WHERE id = ?',
      [inventory.id]
    );

    res.status(200).json({
      message: isNewTicket ? 'Ticket scanned and added to inventory' : 'Ticket marked as sold',
      ticket,
      decoded,
      lottery: {
        name: inventory.name,
        price: inventory.price,
      },
      inventory: (updatedInventoryResult as any[])[0],
    });
  } catch (error) {
    console.error('Scan ticket error:', error);
    res.status(500).json({ error: 'Server error during ticket scan' });
  }
};

export const getScanHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const storeId = parseInt(req.params.storeId);
    const limit = parseInt(req.query.limit as string) || 50;

    // Verify store ownership
    const [storeCheck] = await pool.query(
      'SELECT * FROM stores WHERE store_id = ? AND owner_id = ?',
      [storeId, userId]
    );

    if ((storeCheck as any[]).length === 0) {
      res.status(404).json({ error: 'Store not found' });
      return;
    }

    const [result] = await pool.query(
      `SELECT
        st.*,
        lt.name as lottery_name,
        lt.price as lottery_price,
        u.full_name as scanned_by_name
      FROM scanned_tickets st
      LEFT JOIN lottery_types lt ON st.lottery_type_id = lt.id
      LEFT JOIN users u ON st.scanned_by = u.id
      WHERE st.store_id = ?
      ORDER BY st.scanned_at DESC
      LIMIT ?`,
      [storeId, limit]
    );

    res.status(200).json({ scanHistory: result });
  } catch (error) {
    console.error('Get scan history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
