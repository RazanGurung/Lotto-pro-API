import { Router } from 'express';
import {
  superAdminLogin,
  getSuperAdminProfile,
  updateSuperAdminProfile,
} from '../controllers/superAdminController';
import { asyncHandler } from '../utils/asyncHandler';
import { superAdminAuthMiddleware } from '../middleware/auth';

const router = Router();

router.post('/login', asyncHandler(superAdminLogin));
router.get(
  '/profile',
  superAdminAuthMiddleware,
  asyncHandler(getSuperAdminProfile)
);
router.put(
  '/profile',
  superAdminAuthMiddleware,
  asyncHandler(updateSuperAdminProfile)
);

export default router;
