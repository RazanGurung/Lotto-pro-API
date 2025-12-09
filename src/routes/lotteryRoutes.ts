import { Router } from 'express';
import {
  getLotteryTypes,
  getStoreInventory,
  getLotteryDetail,
  updateInventory,
} from '../controllers/lotteryController';
import { storeAccessAuthMiddleware } from '../middleware/auth';

const router = Router();

// All lottery routes require authentication
router.use(storeAccessAuthMiddleware);

router.get('/types/store/:storeId', getLotteryTypes);
router.get('/store/:storeId/inventory', getStoreInventory);
router.get('/store/:storeId/lottery/:lotteryTypeId', getLotteryDetail);
router.put('/store/:storeId/lottery/:lotteryTypeId', updateInventory);
router.get('/clerk/store/:storeId/inventory', getStoreInventory);
router.get('/clerk/store/:storeId/lottery/:lotteryTypeId', getLotteryDetail);
router.get('/clerk/store/:storeId/types', getLotteryTypes);

export default router;
