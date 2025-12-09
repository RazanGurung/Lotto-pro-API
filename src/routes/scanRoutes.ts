import { Router } from 'express';
import { scanTicket, getScanHistory } from '../controllers/scanController';
import { storeAccessAuthMiddleware } from '../middleware/auth';

const router = Router();

// All scan routes require authentication
router.use(storeAccessAuthMiddleware);

router.post('/scan', scanTicket);
router.get('/scan/history/:storeId', getScanHistory);

export default router;
