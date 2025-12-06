import { Router } from 'express';
import {
  superAdminLogin,
  getSuperAdminProfile,
  updateSuperAdminProfile,
} from '../controllers/superAdminController';
import {
  createLotteryMaster,
  getLotteryMasters,
  assignLotteryToSuperAdmin,
  removeLotteryAssignment,
  updateLotteryStatus,
  updateLotteryMaster,
  deleteLotteryMaster,
} from '../controllers/lotteryMasterController';
import { asyncHandler } from '../utils/asyncHandler';
import { superAdminAuthMiddleware } from '../middleware/auth';

const router = Router();
// super admin login
router.post('/login', asyncHandler(superAdminLogin));
/// GET super admin profile
router.get(
  '/profile',
  superAdminAuthMiddleware,
  asyncHandler(getSuperAdminProfile)
);
/// UPDATE super admin profile
router.put(
  '/profile',
  superAdminAuthMiddleware,
  asyncHandler(updateSuperAdminProfile)
);
/// ADD lotteries by super admin
router.post(
  '/lotteries',
  superAdminAuthMiddleware,
  asyncHandler(createLotteryMaster)
);

router.get(
  '/lotteries',
  superAdminAuthMiddleware,
  asyncHandler(getLotteryMasters)
);

router.post(
  '/lotteries/:lotteryId/assign',
  superAdminAuthMiddleware,
  asyncHandler(assignLotteryToSuperAdmin)
);

router.delete(
  '/lotteries/:lotteryId/assign',
  superAdminAuthMiddleware,
  asyncHandler(removeLotteryAssignment)
);

router.patch(
  '/lotteries/:lotteryId/status',
  superAdminAuthMiddleware,
  asyncHandler(updateLotteryStatus)
);

router.put(
  '/lotteries/:lotteryId',
  superAdminAuthMiddleware,
  asyncHandler(updateLotteryMaster)
);

router.delete(
  '/lotteries/:lotteryId',
  superAdminAuthMiddleware,
  asyncHandler(deleteLotteryMaster)
);

export default router;
