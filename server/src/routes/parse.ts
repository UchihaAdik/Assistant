import { Router, Response } from 'express';
import { processMessage, answerQuestion } from '../services/gemini';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(requireAuth);

async function fetchForScope(userId: string, scope: string) {
  const where: Record<string, unknown> = { userId };
  const now = new Date();

  if (scope === 'tasks') {
    where.category = 'tasks'; // intentionally wrong — handled below
  } else if (scope === 'finance') {
    where.category = 'finance';
    where.createdAt = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
  } else if (scope === 'sport') {
    where.category = 'sport';
    where.createdAt = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
  }

  if (scope === 'tasks') {
    // tasks: all, no date filter (include future deadlines)
    return prisma.record.findMany({
      where: { userId, category: 'task' },
      include: { task: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  if (scope === 'finance' || scope === 'sport') {
    return prisma.record.findMany({
      where,
      include: { finance: true, sport: true, task: true, note: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // 'all' — last 60 records
  return prisma.record.findMany({
    where: { userId },
    include: { finance: true, sport: true, task: true, note: true },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
}

router.post('/', async (req: AuthRequest, res: Response) => {
  const { text } = req.body as { text?: string };

  if (!text?.trim()) {
    res.status(400).json({ error: 'Поле text обязательно' });
    return;
  }

  try {
    const result = await processMessage(text.trim());

    if (result.type === 'records') {
      res.json({ type: 'records', records: result.records });
      return;
    }

    // It's a question — fetch relevant records and answer
    const todayISO = new Date().toISOString().split('T')[0];
    const dbRecords = await fetchForScope(req.userId!, result.scope);
    const answer = await answerQuestion(text.trim(), dbRecords as Record<string, unknown>[], todayISO);

    res.json({ type: 'answer', text: answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    console.error('Parse error:', message);
    res.status(500).json({ error: `Ошибка: ${message}` });
  }
});

export default router;
