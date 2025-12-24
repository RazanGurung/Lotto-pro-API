import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { LotteryStatus } from '../models/types';
import { normalizeLotteryNumber } from '../utils/lottery';

const LOTTERY_TABLE = 'LOTTERY_MASTER';
const ASSIGN_TABLE = 'SUPER_ADMIN_LOTTERY';

const mapLotteryRow = (row: any) => ({
  lottery_id: row.lottery_id,
  lottery_name: row.lottery_name,
  lottery_number: row.lottery_number,
  price: row.price,
  launch_date: row.launch_date,
  state: row.state,
  start_number: row.start_number,
  end_number: row.end_number,
  status: row.status,
  created_at: row.created_at,
  updated_at: row.updated_at,
  image_url: row.image_url,
  assigned_to_caller: Boolean(row.assigned_to_caller),
  creator: row.creator_id
    ? {
        super_admin_id: row.creator_id,
        name: row.creator_name,
        email: row.creator_email,
      }
    : null,
});

const fetchLotteryWithMeta = async (
  lotteryId: number,
  adminId: number
): Promise<any | null> => {
  const [rows] = await pool.query(
    `SELECT
       lm.*,
       (callerAssignment.super_admin_id IS NOT NULL) AS assigned_to_caller,
       creator.super_admin_id AS creator_id,
       creator.name AS creator_name,
       creator.email AS creator_email
     FROM ${LOTTERY_TABLE} lm
     LEFT JOIN ${ASSIGN_TABLE} callerAssignment
       ON callerAssignment.lottery_id = lm.lottery_id
      AND callerAssignment.super_admin_id = ?
     LEFT JOIN SUPER_ADMIN creator
       ON creator.super_admin_id = (
         SELECT sal.super_admin_id
         FROM ${ASSIGN_TABLE} sal
         WHERE sal.lottery_id = lm.lottery_id
         ORDER BY sal.assigned_at ASC
         LIMIT 1
       )
     WHERE lm.lottery_id = ?
     LIMIT 1`,
    [adminId, lotteryId]
  );

  if ((rows as any[]).length === 0) {
    return null;
  }

  return mapLotteryRow((rows as any[])[0]);
};

const validateLotteryPayload = (body: any): {
  valid: boolean;
  errors?: string;
  data?: {
    lottery_name: string;
    lottery_number: string;
    price: number;
    launch_date?: string;
    state?: string;
    start_number: number;
    end_number: number;
    status: LotteryStatus;
    image_url?: string;
  };
} => {
  const {
    lottery_name,
    lottery_number,
    price,
    launch_date,
    state,
    start_number,
    end_number,
    status,
    image_url,
  } =
    body;

  if (!lottery_name || typeof lottery_name !== 'string') {
    return { valid: false, errors: 'lottery_name is required' };
  }

  if (!lottery_number || typeof lottery_number !== 'string') {
    return { valid: false, errors: 'lottery_number is required' };
  }

  const normalizedLotteryNumber = normalizeLotteryNumber(lottery_number);
  if (!/^\d{3}$/.test(normalizedLotteryNumber)) {
    return { valid: false, errors: 'lottery_number must contain up to 3 digits' };
  }

  if (price === undefined || isNaN(Number(price)) || Number(price) <= 0) {
    return { valid: false, errors: 'price must be a positive number' };
  }

  let normalizedLaunchDate: string | undefined;
  if (launch_date) {
    const date = new Date(launch_date);
    if (isNaN(date.getTime())) {
      return { valid: false, errors: 'launch_date must be a valid date' };
    }
    normalizedLaunchDate = date.toISOString().split('T')[0];
  }

  let normalizedState: string | undefined;
  if (state !== undefined) {
    if (typeof state !== 'string') {
      return { valid: false, errors: 'state must be a string' };
    }
    normalizedState = state.trim();
  }

  if (
    start_number === undefined ||
    end_number === undefined ||
    isNaN(Number(start_number)) ||
    isNaN(Number(end_number))
  ) {
    return { valid: false, errors: 'start_number and end_number are required' };
  }

  if (Number(start_number) >= Number(end_number)) {
    return { valid: false, errors: 'end_number must be greater than start_number' };
  }

  const lotteryStatus: LotteryStatus =
    status && status !== '' ? status : 'inactive';

  if (!['active', 'inactive'].includes(lotteryStatus)) {
    return { valid: false, errors: 'status must be active or inactive' };
  }

  if (image_url && typeof image_url !== 'string') {
    return { valid: false, errors: 'image_url must be a string' };
  }

  return {
    valid: true,
    data: {
      lottery_name: lottery_name.trim(),
    lottery_number: normalizedLotteryNumber,
      price: Number(price),
      launch_date: normalizedLaunchDate,
      state: normalizedState,
      start_number: Number(start_number),
      end_number: Number(end_number),
      status: lotteryStatus,
      image_url: image_url?.trim(),
    },
  };
};

export const createLotteryMaster = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;

    if (!adminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const validation = validateLotteryPayload(req.body);
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: validation.errors });
      return;
    }

    const {
      lottery_name,
      lottery_number,
      price,
      launch_date,
      state,
      start_number,
      end_number,
      status,
      image_url,
    } =
      validation.data;

    // Allow duplicate names/numbers; no uniqueness enforcement here

    const [insertResult] = await pool.query(
      `INSERT INTO ${LOTTERY_TABLE} (lottery_name, lottery_number, price, launch_date, state, start_number, end_number, status, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lottery_name,
        lottery_number,
        price,
        launch_date ?? null,
        state ?? null,
        start_number,
        end_number,
        status,
        image_url ?? null,
      ]
    );

    const lotteryId = (insertResult as any).insertId;

    await pool.query(
      `INSERT INTO ${ASSIGN_TABLE} (super_admin_id, lottery_id)
       VALUES (?, ?)`,
      [adminId, lotteryId]
    );

    const lottery = await fetchLotteryWithMeta(lotteryId, adminId);

    res.status(201).json({
      lottery,
      message: 'Lottery created and assigned successfully',
    });
  } catch (error) {
    console.error('Create lottery master error:', error);
    res.status(500).json({ error: 'Server error creating lottery' });
  }
};

export const getLotteryMasters = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;

    if (!adminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const [lotteryRows] = await pool.query(
      `SELECT
        lm.*,
        (callerAssignment.super_admin_id IS NOT NULL) AS assigned_to_caller,
        creator.super_admin_id AS creator_id,
        creator.name AS creator_name,
        creator.email AS creator_email
       FROM ${LOTTERY_TABLE} lm
       LEFT JOIN ${ASSIGN_TABLE} callerAssignment
         ON callerAssignment.lottery_id = lm.lottery_id
        AND callerAssignment.super_admin_id = ?
       LEFT JOIN SUPER_ADMIN creator
         ON creator.super_admin_id = (
           SELECT sal.super_admin_id
           FROM ${ASSIGN_TABLE} sal
           WHERE sal.lottery_id = lm.lottery_id
           ORDER BY sal.assigned_at ASC
           LIMIT 1
         )
       ORDER BY lm.created_at DESC`,
      [adminId]
    );

    const lotteries = (lotteryRows as any[]).map(mapLotteryRow);

    res.status(200).json({
      lotteries,
    });
  } catch (error) {
    console.error('Get lottery master error:', error);
    res.status(500).json({ error: 'Server error fetching lotteries' });
  }
};

export const assignLotteryToSuperAdmin = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const requestingAdminId = req.user?.id;
    const lotteryId = Number(req.params.lotteryId);
    const { super_admin_id } = req.body;
    const targetAdminId = Number(super_admin_id) || requestingAdminId;

    if (!requestingAdminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!lotteryId || isNaN(lotteryId)) {
      res.status(400).json({ error: 'Invalid lotteryId' });
      return;
    }

    const [lotteryRows] = await pool.query(
      `SELECT lottery_id FROM ${LOTTERY_TABLE} WHERE lottery_id = ?`,
      [lotteryId]
    );

    if ((lotteryRows as any[]).length === 0) {
      res.status(404).json({ error: 'Lottery not found' });
      return;
    }

    const [adminRows] = await pool.query(
      'SELECT super_admin_id FROM SUPER_ADMIN WHERE super_admin_id = ?',
      [targetAdminId]
    );

    if ((adminRows as any[]).length === 0) {
      res.status(404).json({ error: 'Target super admin not found' });
      return;
    }

    const [existingAssignment] = await pool.query(
      `SELECT * FROM ${ASSIGN_TABLE} WHERE super_admin_id = ? AND lottery_id = ?`,
      [targetAdminId, lotteryId]
    );

    if ((existingAssignment as any[]).length > 0) {
      res.status(400).json({ error: 'Lottery already assigned to this admin' });
      return;
    }

    await pool.query(
      `INSERT INTO ${ASSIGN_TABLE} (super_admin_id, lottery_id) VALUES (?, ?)`,
      [targetAdminId, lotteryId]
    );

    res.status(201).json({
      lottery_id: lotteryId,
      super_admin_id: targetAdminId,
      message: 'Lottery assigned successfully',
    });
  } catch (error) {
    console.error('Assign lottery error:', error);
    res.status(500).json({ error: 'Server error assigning lottery' });
  }
};

export const removeLotteryAssignment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const requestingAdminId = req.user?.id;
    const lotteryId = Number(req.params.lotteryId);
    const targetAdminId = Number(req.body?.super_admin_id || requestingAdminId);

    if (!requestingAdminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!lotteryId || isNaN(lotteryId)) {
      res.status(400).json({ error: 'Invalid lotteryId' });
      return;
    }

    const [result] = await pool.query(
      `DELETE FROM ${ASSIGN_TABLE}
       WHERE super_admin_id = ? AND lottery_id = ?`,
      [targetAdminId, lotteryId]
    );

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'Assignment not found' });
      return;
    }

    res.status(200).json({
      lottery_id: lotteryId,
      super_admin_id: targetAdminId,
      message: 'Lottery unassigned successfully',
    });
  } catch (error) {
    console.error('Remove lottery assignment error:', error);
    res.status(500).json({ error: 'Server error removing assignment' });
  }
};

export const updateLotteryStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    const lotteryId = Number(req.params.lotteryId);
    const { status } = req.body;

    if (!adminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!lotteryId || isNaN(lotteryId)) {
      res.status(400).json({ error: 'Invalid lotteryId' });
      return;
    }

    if (!status || !['active', 'inactive'].includes(status)) {
      res
        .status(400)
        .json({ error: "Status must be either 'active' or 'inactive'" });
      return;
    }

    const [assignment] = await pool.query(
      `SELECT 1 FROM ${ASSIGN_TABLE} WHERE lottery_id = ? AND super_admin_id = ?`,
      [lotteryId, adminId]
    );

    if ((assignment as any[]).length === 0) {
      res.status(403).json({ error: 'You are not assigned to this lottery' });
      return;
    }

    const [result] = await pool.query(
      `UPDATE ${LOTTERY_TABLE} SET status = ? WHERE lottery_id = ?`,
      [status, lotteryId]
    );

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'Lottery not found' });
      return;
    }

    const lottery = await fetchLotteryWithMeta(lotteryId, adminId);

    res.status(200).json({
      lottery,
      message: `Lottery ${status === 'active' ? 'reactivated' : 'deactivated'} successfully`,
    });
  } catch (error) {
    console.error('Update lottery status error:', error);
    res.status(500).json({ error: 'Server error updating lottery status' });
  }
};

export const updateLotteryMaster = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    const lotteryId = Number(req.params.lotteryId);

    if (!adminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!lotteryId || isNaN(lotteryId)) {
      res.status(400).json({ error: 'Invalid lotteryId' });
      return;
    }

    const validation = validateLotteryPayload(req.body);
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: validation.errors });
      return;
    }

    const {
      lottery_name,
      lottery_number,
      price,
      launch_date,
      state,
      start_number,
      end_number,
      status,
      image_url,
    } = validation.data;

    const [existingLottery] = await pool.query(
      `SELECT lottery_id FROM ${LOTTERY_TABLE} WHERE lottery_id = ?`,
      [lotteryId]
    );

    if ((existingLottery as any[]).length === 0) {
      res.status(404).json({ error: 'Lottery not found' });
      return;
    }

    const [nameConflict] = await pool.query(
      `SELECT lottery_id FROM ${LOTTERY_TABLE} WHERE lottery_name = ? AND lottery_id != ?`,
      [lottery_name, lotteryId]
    );

    if ((nameConflict as any[]).length > 0) {
      res.status(400).json({ error: 'Lottery with this name already exists' });
      return;
    }

    const [numberConflict] = await pool.query(
      `SELECT lottery_id FROM ${LOTTERY_TABLE} WHERE lottery_number = ? AND lottery_id != ?`,
      [lottery_number, lotteryId]
    );

    if ((numberConflict as any[]).length > 0) {
      res.status(400).json({ error: 'Lottery with this number already exists' });
      return;
    }

    await pool.query(
      `UPDATE ${LOTTERY_TABLE}
       SET lottery_name = ?,
           lottery_number = ?,
           price = ?,
           launch_date = ?,
           state = ?,
           start_number = ?,
           end_number = ?,
           status = ?,
           image_url = ?
       WHERE lottery_id = ?`,
      [
        lottery_name,
        lottery_number,
        price,
        launch_date ?? null,
        state ?? null,
        start_number,
        end_number,
        status,
        image_url ?? null,
        lotteryId,
      ]
    );

    const lottery = await fetchLotteryWithMeta(lotteryId, adminId);

    res.status(200).json({
      lottery,
      message: 'Lottery updated successfully',
    });
  } catch (error) {
    console.error('Update lottery master error:', error);
    res.status(500).json({ error: 'Server error updating lottery' });
  }
};

export const deleteLotteryMaster = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const adminId = req.user?.id;
    const lotteryId = Number(req.params.lotteryId);

    if (!adminId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!lotteryId || isNaN(lotteryId)) {
      res.status(400).json({ error: 'Invalid lotteryId' });
      return;
    }

    const [assignment] = await pool.query(
      `SELECT * FROM ${ASSIGN_TABLE} WHERE lottery_id = ? AND super_admin_id = ?`,
      [lotteryId, adminId]
    );

    if ((assignment as any[]).length === 0) {
      res.status(403).json({ error: 'You are not assigned to this lottery' });
      return;
    }

    await pool.query(
      `DELETE FROM ${ASSIGN_TABLE} WHERE lottery_id = ?`,
      [lotteryId]
    );

    const [deleteResult] = await pool.query(
      `DELETE FROM ${LOTTERY_TABLE} WHERE lottery_id = ?`,
      [lotteryId]
    );

    if ((deleteResult as any).affectedRows === 0) {
      res.status(404).json({ error: 'Lottery not found' });
      return;
    }

    res.status(200).json({
      lottery_id: lotteryId,
      message: 'Lottery deleted successfully',
    });
  } catch (error) {
    console.error('Delete lottery master error:', error);
    res.status(500).json({ error: 'Server error deleting lottery' });
  }
};
