import { Router } from 'express';
import { query } from '../controllers/assistant.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.post('/', authenticate, authorize('owner'), query);

export default router;
