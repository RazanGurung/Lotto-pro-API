import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { storeAccessAuthMiddleware, authMiddleware } from '../middleware/auth';
import {
  getNotificationSettings,
  updateNotificationSettings,
} from '../controllers/notificationController';

const router = Router();

router.get(
  '/store/:storeId/notifications',
  storeAccessAuthMiddleware,
  asyncHandler(getNotificationSettings)
);

router.put(
  '/store/:storeId/notifications',
  authMiddleware,
  asyncHandler(updateNotificationSettings)
);

export default router;
