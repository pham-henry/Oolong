import { Router } from 'express';
import { getInventory, adjustInventory, updateThresholds } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/', authenticate, getInventory);
router.put('/:id/adjust', authenticate, adjustInventory);
router.put('/:id/thresholds', authenticate, authorize('owner'), updateThresholds);

export default router;
