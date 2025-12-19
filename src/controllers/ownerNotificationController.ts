import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  fetchOwnerNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notificationService';

export const listOwnerNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user || req.user.role !== 'store_owner') {
    res.status(403).json({ error: 'Store owner access required' });
    return;
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const unreadOnly = req.query.unread === 'true';

  const notifications = await fetchOwnerNotifications(req.user.id, {
    limit,
    unreadOnly,
  });

  res.status(200).json({ notifications });
};

export const markOwnerNotificationRead = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user || req.user.role !== 'store_owner') {
    res.status(403).json({ error: 'Store owner access required' });
    return;
  }

  const notificationId = parseInt(req.params.notificationId, 10);
  if (isNaN(notificationId)) {
    res.status(400).json({ error: 'notificationId must be a number' });
    return;
  }

  const updated = await markNotificationRead(req.user.id, notificationId);
  if (!updated) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }

  res.status(200).json({ success: true });
};

export const markAllOwnerNotificationsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.user || req.user.role !== 'store_owner') {
    res.status(403).json({ error: 'Store owner access required' });
    return;
  }

  await markAllNotificationsRead(req.user.id);
  res.status(200).json({ success: true });
};
