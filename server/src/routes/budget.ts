import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

/* GET /api/budget — budgets + current month spending */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [budgets, financeRecords] = await Promise.all([
      prisma.budget.findMany({ where: { userId: req.userId! } }),
      prisma.record.findMany({
        where: { userId: req.userId!, category: 'finance', createdAt: { gte: startOfMonth }, deletedAt: null },
        include: { finance: true },
      }),
    ]);

    const monthlySpend = financeRecords.reduce((sum, r) => sum + (r.finance?.amount ?? 0), 0);

    const result = budgets.map(b => ({
      ...b,
      spent: b.category === 'finance' ? monthlySpend : 0,
    }));

    res.json({ budgets: result, monthlySpend });
  } catch (error) {
    console.error('Budget fetch error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/* POST /api/budget — create or update */
router.post('/', async (req: AuthRequest, res: Response) => {
  const { category, amount } = req.body as { category: string; amount: number };
  if (!category || typeof amount !== 'number') {
    res.status(400).json({ error: 'Нужны category и amount' });
    return;
  }
  try {
    const budget = await prisma.budget.upsert({
      where: { userId_category_period: { userId: req.userId!, category, period: 'month' } },
      create: { userId: req.userId!, category, amount, period: 'month' },
      update: { amount },
    });
    res.json(budget);
  } catch (error) {
    console.error('Budget save error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/* DELETE /api/budget/:id */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.budget.deleteMany({ where: { id: req.params.id as string, userId: req.userId! } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Budget delete error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
