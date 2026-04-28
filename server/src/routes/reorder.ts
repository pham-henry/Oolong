/**
 * Reorder workflow routes — Owner-only.
 *
 *   GET    /api/reorders            list all (any status)
 *   GET    /api/reorders/pending    list only pending
 *   POST   /api/reorders/run-check  manually trigger inventory check
 *   PATCH  /api/reorders/:id/approve
 *   PATCH  /api/reorders/:id/dismiss
 *   PATCH  /api/reorders/:id/complete
 */

import { Router } from 'express';
import {
  listAll,
  listPending,
  runCheck,
  approve,
  dismiss,
  complete,
} from '../controllers/reorder.controller';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

// All endpoints require Owner role. Workers must never reach them.
router.use(authenticate, authorize('owner'));

router.get('/', listAll);
router.get('/pending', listPending);
router.post('/run-check', runCheck);
router.patch('/:id/approve', approve);
router.patch('/:id/dismiss', dismiss);
router.patch('/:id/complete', complete);

export default router;
