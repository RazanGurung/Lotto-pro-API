import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { authorizeStoreAccess, StoreAccessError } from '../utils/storeAccess';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SETTING_KEYS,
  NotificationSettingKey,
} from '../constants/notificationSettings';

type RawSettingsRow = Record<NotificationSettingKey | 'id' | 'owner_id', number | boolean | Date>;

const SETTINGS_TABLE = 'STORE_NOTIFICATION_SETTINGS';

const normalizeSettingsRow = (row: RawSettingsRow) => {
  const normalized: Record<string, boolean | number | Date> = {};
  for (const key of Object.keys(row)) {
    const value = row[key as keyof RawSettingsRow];
    if (typeof value === 'number' && NOTIFICATION_SETTING_KEYS.includes(key as NotificationSettingKey)) {
      normalized[key] = value === 1;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
};

const ensureOwnerSettings = async (ownerId: number): Promise<any> => {
  const [existing] = await pool.query(
    `SELECT * FROM ${SETTINGS_TABLE} WHERE owner_id = ?`,
    [ownerId]
  );

  if ((existing as any[]).length > 0) {
    return normalizeSettingsRow((existing as any[])[0]);
  }

  const columns = ['owner_id', ...NOTIFICATION_SETTING_KEYS];
  const values = [
    ownerId,
    ...NOTIFICATION_SETTING_KEYS.map((key) =>
      DEFAULT_NOTIFICATION_SETTINGS[key] ? 1 : 0
    ),
  ];

  const placeholders = columns.map(() => '?').join(', ');

  await pool.query(
    `INSERT INTO ${SETTINGS_TABLE} (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );

  const [created] = await pool.query(
    `SELECT * FROM ${SETTINGS_TABLE} WHERE owner_id = ?`,
    [ownerId]
  );

  return normalizeSettingsRow((created as any[])[0]);
};

export const getNotificationSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const storeId = parseInt(req.params.storeId, 10);
    if (isNaN(storeId)) {
      res.status(400).json({ error: 'storeId must be a number' });
      return;
    }

    const storeRecord = await authorizeStoreAccess(storeId, req.user);
    const settings = await ensureOwnerSettings(storeRecord.owner_id);

    res.status(200).json({
      owner_id: storeRecord.owner_id,
      settings,
    });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Get notification settings error:', error);
    res.status(500).json({ error: 'Server error fetching notification settings' });
  }
};

export const updateNotificationSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'store_owner') {
      res.status(403).json({ error: 'Only store owners can update settings' });
      return;
    }

    const storeId = parseInt(req.params.storeId, 10);
    if (isNaN(storeId)) {
      res.status(400).json({ error: 'storeId must be a number' });
      return;
    }

    const storeRecord = await authorizeStoreAccess(storeId, req.user);
    if (storeRecord.owner_id !== req.user.id) {
      res.status(403).json({ error: 'Not authorized to update this store' });
      return;
    }

    const updates: Partial<Record<NotificationSettingKey, boolean>> = {};
    for (const key of NOTIFICATION_SETTING_KEYS) {
      if (key in req.body) {
        const value = req.body[key];
        if (typeof value !== 'boolean') {
          res.status(400).json({ error: `Field ${key} must be a boolean` });
          return;
        }
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid notification settings provided' });
      return;
    }

    const setClause = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(', ');
    const values = Object.values(updates).map((value) => (value ? 1 : 0));

    await pool.query(
      `UPDATE ${SETTINGS_TABLE}
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE owner_id = ?`,
      [...values, storeRecord.owner_id]
    );

    const updatedSettings = await ensureOwnerSettings(storeRecord.owner_id);

    res.status(200).json({
      owner_id: storeRecord.owner_id,
      settings: updatedSettings,
      message: 'Notification settings updated successfully',
    });
  } catch (error) {
    if (error instanceof StoreAccessError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Update notification settings error:', error);
    res.status(500).json({ error: 'Server error updating notification settings' });
  }
};
