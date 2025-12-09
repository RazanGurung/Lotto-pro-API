import { Router } from 'express';
import {
  getStores,
  getStoreById,
  createStore,
  updateStore,
  deleteStore,
  getClerkStoreDashboard,
} from '../controllers/storeController';
import { storeAccountLogin } from '../controllers/authController';
import { authMiddleware, storeAccessAuthMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/login', asyncHandler(storeAccountLogin));
router.get(
  '/clerk/:storeId/dashboard',
  storeAccessAuthMiddleware,
  asyncHandler(getClerkStoreDashboard)
);
router.get(
  '/clerk/:storeId',
  storeAccessAuthMiddleware,
  asyncHandler(getClerkStoreDashboard)
);

router.use(authMiddleware);

router.get('/', getStores);
router.get('/:id', getStoreById);
router.post('/', createStore);
router.put('/:id', updateStore);
router.delete('/:id', deleteStore);

export default router;
