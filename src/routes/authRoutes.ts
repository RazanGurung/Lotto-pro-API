import { Router } from 'express';
import { register, login, getProfile } from '../controllers/authController';
import { authMiddleware, generalAuthMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Public routes
router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));

// Protected routes
router.get('/profile', generalAuthMiddleware, asyncHandler(getProfile));

export default router;
