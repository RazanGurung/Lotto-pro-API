export const DEFAULT_NOTIFICATION_SETTINGS = {
  push_notifications: true,
  email_notifications: true,
  sms_notifications: false,
  low_stock_alerts: true,
  sales_updates: true,
  inventory_alerts: true,
  system_updates: true,
  weekly_reports: true,
  daily_summary: false,
};

export type NotificationSettingKey = keyof typeof DEFAULT_NOTIFICATION_SETTINGS;

export const NOTIFICATION_SETTING_KEYS = Object.keys(
  DEFAULT_NOTIFICATION_SETTINGS
) as NotificationSettingKey[];
