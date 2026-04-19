import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import parseRouter from './routes/parse';
import recordsRouter from './routes/records';
import statsRouter from './routes/stats';
import authRouter from './routes/auth';
import digestRouter from './routes/digest';
import budgetRouter from './routes/budget';
import pushRouter from './routes/push';
import { startCron } from './worker/cron';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/parse', parseRouter);
app.use('/api/records', recordsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/digest', digestRouter);
app.use('/api/budget', budgetRouter);
app.use('/api/push', pushRouter);

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  startCron();
});

export default app;
