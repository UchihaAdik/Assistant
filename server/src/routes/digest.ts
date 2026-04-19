import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { weeklyDigest, generateInsight } from '../services/gemini';

const router = Router();
router.use(requireAuth);

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const from = new Date();
    from.setDate(from.getDate() - 7);

    const records = await prisma.record.findMany({
      where: { userId: req.userId!, createdAt: { gte: from } },
      include: { finance: true, sport: true, task: true, note: true },
      orderBy: { createdAt: 'desc' },
    });

    const todayISO = new Date().toISOString().split('T')[0];
    const text = await weeklyDigest(records as Record<string, unknown>[], todayISO);

    res.json({ type: 'answer', text });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Ошибка';
    console.error('Digest error:', msg);
    res.status(500).json({ error: msg });
  }
});

router.post('/insight', async (req: AuthRequest, res: Response) => {
  try {
    const from = new Date();
    from.setDate(from.getDate() - 14);

    const records = await prisma.record.findMany({
      where: { userId: req.userId!, createdAt: { gte: from } },
      include: { finance: true, sport: true, task: true, mood: true },
      orderBy: { createdAt: 'desc' },
    });

    const text = await generateInsight(records as Record<string, unknown>[]);
    res.json({ insight: text });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка генерации инсайта' });
  }
});

export default router;
