import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import inventoryRoutes from './routes/inventory';
import salesRoutes from './routes/sales';
import analyticsRoutes from './routes/analytics';
import assistantRoutes from './routes/assistant';
import auditRoutes from './routes/audit';
import reorderRoutes from './routes/reorder';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/reorders', reorderRoutes);

app.use(errorHandler);

export default app;
