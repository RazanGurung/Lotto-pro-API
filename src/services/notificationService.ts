import { pool } from '../config/database';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_SETTING_KEYS,
  NotificationSettingKey,
} from '../constants/notificationSettings';

const SETTINGS_TABLE = 'STORE_NOTIFICATION_SETTINGS';
const NOTIFICATIONS_TABLE = 'STORE_NOTIFICATIONS';

export type NotificationType = 'low_stock' | 'inventory_alert' | 'sales_update' | 'system';

const TYPE_SETTING_MAP: Record<NotificationType, NotificationSettingKey | null> = {
  low_stock: 'low_stock_alerts',
  inventory_alert: 'inventory_alerts',
  sales_update: 'sales_updates',
  system: 'system_updates',
};

export interface StoreNotification {
  id: number;
  owner_id: number;
  store_id: number;
  notification_type: NotificationType;
  title: string | null;
  message: string;
  metadata?: Record<string, any>;
  is_read: boolean;
  created_at: Date;
  store_name?: string;
}

export interface CreateNotificationOptions {
  ownerId: number;
  storeId: number;
  type: NotificationType;
  title?: string;
  message: string;
  metadata?: Record<string, any>;
}

const normalizeSettingsRow = (row: any) => {
  const normalized: Record<string, boolean | number | Date> = {};
  for (const key of Object.keys(row)) {
    const value = row[key];
    if (typeof value === 'number' && NOTIFICATION_SETTING_KEYS.includes(key as NotificationSettingKey)) {
      normalized[key] = value === 1;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
};

export const ensureOwnerSettings = async (ownerId: number): Promise<Record<string, any>> => {
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

  await pool.query(
    `INSERT INTO ${SETTINGS_TABLE} (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    values
  );

  const [created] = await pool.query(
    `SELECT * FROM ${SETTINGS_TABLE} WHERE owner_id = ?`,
    [ownerId]
  );

  return normalizeSettingsRow((created as any[])[0]);
};

const shouldSendNotification = async (
  ownerId: number,
  type: NotificationType
): Promise<boolean> => {
  const settings = await ensureOwnerSettings(ownerId);
  const settingKey = TYPE_SETTING_MAP[type];
  if (!settingKey) return true;
  return Boolean(settings[settingKey]);
};

export const createOwnerNotification = async ({
  ownerId,
  storeId,
  type,
  title,
  message,
  metadata,
}: CreateNotificationOptions): Promise<void> => {
  if (!ownerId) return;

  const enabled = await shouldSendNotification(ownerId, type);
  if (!enabled) return;

  await pool.query(
    `INSERT INTO ${NOTIFICATIONS_TABLE}
      (owner_id, store_id, notification_type, title, message, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      ownerId,
      storeId,
      type,
      title || null,
      message,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
};

export const fetchOwnerNotifications = async (
  ownerId: number,
  options?: { limit?: number; unreadOnly?: boolean }
): Promise<StoreNotification[]> => {
  const limit = options?.limit ?? 50;
  const unreadOnly = options?.unreadOnly ?? false;

  const whereClause = unreadOnly ? 'AND n.is_read = 0' : '';

  const [rows] = await pool.query(
    `SELECT
        n.*,
        s.store_name
     FROM ${NOTIFICATIONS_TABLE} n
     LEFT JOIN STORES s ON n.store_id = s.store_id
     WHERE n.owner_id = ?
       ${whereClause}
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [ownerId, limit]
  );

  return (rows as any[]).map((row) => ({
    id: row.id,
    owner_id: row.owner_id,
    store_id: row.store_id,
    notification_type: row.notification_type,
    title: row.title,
    message: row.message,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    is_read: Boolean(row.is_read),
    created_at: row.created_at,
    store_name: row.store_name,
  }));
};

export const markNotificationRead = async (
  ownerId: number,
  notificationId: number
): Promise<boolean> => {
  const [result] = await pool.query(
    `UPDATE ${NOTIFICATIONS_TABLE}
     SET is_read = 1
     WHERE id = ? AND owner_id = ?`,
    [notificationId, ownerId]
  );

  return (result as any).affectedRows > 0;
};

export const markAllNotificationsRead = async (ownerId: number): Promise<void> => {
  await pool.query(
    `UPDATE ${NOTIFICATIONS_TABLE}
     SET is_read = 1
     WHERE owner_id = ? AND is_read = 0`,
    [ownerId]
  );
};
