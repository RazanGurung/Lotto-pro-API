import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authMiddleware } from '../middleware/auth';
import {
  listOwnerNotifications,
  markOwnerNotificationRead,
  markAllOwnerNotificationsRead,
} from '../controllers/ownerNotificationController';

const router = Router();

router.get('/', authMiddleware, asyncHandler(listOwnerNotifications));
router.patch('/:notificationId/read', authMiddleware, asyncHandler(markOwnerNotificationRead));
router.post('/mark-all-read', authMiddleware, asyncHandler(markAllOwnerNotificationsRead));

export default router;
