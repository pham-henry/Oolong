import { Router } from 'express';
import { submitSales, getRecipes, getRecentSales } from '../controllers/sales.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.get('/recipes', authenticate, getRecipes);
router.post('/', authenticate, submitSales);
router.get('/', authenticate, getRecentSales);

export default router;
