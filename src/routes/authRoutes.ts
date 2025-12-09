import { Router } from 'express';
import {
  register,
  login,
  storeAccountLogin,
  getProfile,
  updateStoreOwnerProfile,
  deleteStoreOwnerAccount,
} from '../controllers/authController';
import { authMiddleware, generalAuthMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Public routes
router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/store/login', asyncHandler(storeAccountLogin));

// Protected routes
router.get('/profile', generalAuthMiddleware, asyncHandler(getProfile));
router.put('/profile', authMiddleware, asyncHandler(updateStoreOwnerProfile));
router.delete('/profile', authMiddleware, asyncHandler(deleteStoreOwnerAccount));

export default router;
