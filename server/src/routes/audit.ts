import { Router } from 'express';
import { getLogs } from '../controllers/audit.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/', authenticate, authorize('owner'), getLogs);

export default router;
