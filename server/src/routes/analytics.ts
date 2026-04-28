import { Router } from 'express';
import { getOverview, getSalesTrends } from '../controllers/analytics.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.use(authenticate, authorize('owner'));

router.get('/overview', getOverview);
router.get('/sales-trends', getSalesTrends);

export default router;
