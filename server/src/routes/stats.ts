import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const records = await prisma.record.findMany({
      where: { userId: req.userId, deletedAt: null },
      include: { finance: true, sport: true, task: true, mood: true },
      orderBy: { createdAt: 'asc' },
    });

    const categoryStats: Record<string, number> = {};
    records.forEach((r) => {
      categoryStats[r.category] = (categoryStats[r.category] || 0) + 1;
    });

    const financeMap: Record<string, number> = {};
    records
      .filter((r) => r.finance)
      .forEach((r) => {
        const day = r.createdAt.toISOString().split('T')[0];
        financeMap[day] = (financeMap[day] || 0) + (r.finance!.amount || 0);
      });

    const sportMap: Record<string, number> = {};
    records
      .filter((r) => r.sport)
      .forEach((r) => {
        const day = r.createdAt.toISOString().split('T')[0];
        sportMap[day] = (sportMap[day] || 0) + 1;
      });

    const pendingTasks = records.filter((r) => r.task && !r.task.done).length;

    const moodMap: Record<string, number[]> = {};
    records
      .filter((r) => r.mood)
      .forEach((r) => {
        const day = r.createdAt.toISOString().split('T')[0];
        if (!moodMap[day]) moodMap[day] = [];
        moodMap[day].push(r.mood!.score);
      });

    const moodByDay = Object.entries(moodMap).map(([date, scores]) => ({
      date,
      averageScore: parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)),
    }));

    const streakRecords = await prisma.record.findMany({
      where: {
        userId: req.userId,
        deletedAt: null,
        OR: [{ sport: { isNot: null } }, { task: { done: true } }]
      },
      select: { createdAt: true, task: { select: { doneAt: true } } }
    });

    const activeDays = new Set<string>();
    streakRecords.forEach(r => {
      const d = (r.task?.doneAt || r.createdAt).toISOString().split('T')[0];
      activeDays.add(d);
    });

    let streak = 0;
    const td = new Date();
    const tdStr = td.toISOString().split('T')[0];
    td.setDate(td.getDate() - 1);
    const ydStr = td.toISOString().split('T')[0];

    let checkDate = tdStr;
    if (!activeDays.has(tdStr) && activeDays.has(ydStr)) checkDate = ydStr;
    if (activeDays.has(checkDate)) {
      const dt = new Date(checkDate);
      while(activeDays.has(dt.toISOString().split('T')[0])) {
        streak++;
        dt.setDate(dt.getDate() - 1);
      }
    }

    res.json({
      categoryStats,
      financeByDay: Object.entries(financeMap).map(([date, amount]) => ({ date, amount })),
      sportByDay: Object.entries(sportMap).map(([date, count]) => ({ date, count })),
      moodByDay,
      total: records.length,
      pendingTasks,
      streak,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Ошибка статистики' });
  }
});

export default router;
