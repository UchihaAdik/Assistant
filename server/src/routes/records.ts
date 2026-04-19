import { Router, Response, Request } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { toYMD, getFutureDates } from '../lib/dateUtils';

const router = Router();

/* Webhook doesn't strictly need auth, so we'll mount auth manually below */
/* ── CREATE ── */
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { records } = req.body as {
    records: Array<{
      category: string;
      summary: string;
      details: string;
      emoji: string;
      amount?: number | null;
      deadline?: string | null;
      recurrence?: string | null;
      score?: number | null;
    }>;
  };

  if (!records?.length) {
    res.status(400).json({ error: 'Нет записей' });
    return;
  }

  try {
    const results: any[] = [];

    for (const r of records) {
      if (r.recurrence) {
        // PRE-GENERATION LOGIC (EduSchool Style)
        const routineId = Math.random().toString(36).substring(2, 9);
        // Start from today, generate 30 days
        const dates = getFutureDates(r.recurrence, new Date(), 30);
        // Include today if it matches the pattern
        const todayStr = toYMD(new Date());
        if (!dates.includes(todayStr)) {
           // We need to check if today should be included. 
           // Implementation of getFutureDates already checks.
        }
        
        const createdBatch = await Promise.all(dates.map((date: string) => {
          return prisma.record.create({
            data: {
              userId: req.userId!,
              category: r.category,
              summary: r.summary,
              details: r.details,
              emoji: r.emoji,
              routineId,
              createdAt: new Date(date + 'T12:00:00'), // Set to noon to avoid day shifts
              ...(r.category === 'finance' && r.amount != null
                ? { finance: { create: { amount: r.amount, type: r.amount >= 0 ? 'expense' : 'income' } } }
                : {}),
              ...(r.category === 'sport' ? { sport: { create: {} } } : {}),
              task: { create: { deadline: date, recurrence: r.recurrence } },
              ...(r.category === 'note' ? { note: { create: {} } } : {}),
              ...(r.category === 'mood' && r.score != null ? { mood: { create: { score: r.score } } } : {}),
            }
          });
        }));
        results.push(...createdBatch);
      } else {
        // SINGLE RECORD LOGIC
        const res = await prisma.record.create({
          data: {
            userId: req.userId!,
            category: r.category,
            summary: r.summary,
            details: r.details,
            emoji: r.emoji,
            ...(r.category === 'finance' && r.amount != null
              ? { finance: { create: { amount: r.amount, type: r.amount >= 0 ? 'expense' : 'income' } } }
              : {}),
            ...(r.category === 'sport' ? { sport: { create: {} } } : {}),
            ...(r.category === 'task' || r.deadline ? { task: { create: { deadline: r.deadline } } } : {}),
            ...(r.category === 'note' ? { note: { create: {} } } : {}),
            ...(r.category === 'mood' && r.score != null ? { mood: { create: { score: r.score } } } : {}),
          },
        });
        results.push(res);
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Не удалось сохранить' });
  }
});

/* ── EXPORT CSV ── */
router.get('/export', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const records = await prisma.record.findMany({
      where: { userId: req.userId!, deletedAt: null },
      include: { finance: true, sport: true, task: true, note: true, mood: true },
      orderBy: { createdAt: 'desc' },
    });

    const header = 'ID,Дата,Категория,Название,Детали,Сумма,Дедлайн,Выполнено';
    const rows = records.map((r: any) => {
      const date = r.createdAt.toISOString().split('T')[0];
      const amount = r.finance?.amount ?? '';
      const deadline = r.task?.deadline ?? '';
      const done = r.task ? (r.task.done ? 'да' : 'нет') : '';
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      return [r.id, date, r.category, esc(r.summary), esc(r.details), amount, deadline, done].join(',');
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=records-${new Date().toISOString().split('T')[0]}.csv`);
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Ошибка экспорта' });
  }
});

/* ── LIST ── */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { category, from, to, limit, offset } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = { userId: req.userId, deletedAt: null };
  if (category) where.category = category;
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    where.createdAt = dateFilter;
  }

  try {
    const records = await prisma.record.findMany({
      where,
      include: { finance: true, sport: true, task: true, note: true, mood: true },
      orderBy: { createdAt: 'desc' },
      take: limit ? Math.min(parseInt(limit), 500) : 200,
      skip: offset ? parseInt(offset) : 0,
    });
    res.json(records);
  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: 'Не удалось загрузить' });
  }
});

/* ── UPDATE TASK (done / deadline) ── */
router.patch('/tasks/:recordId', requireAuth, async (req: AuthRequest, res: Response) => {
  const recordId = req.params.recordId as string;
  const body = req.body as { done?: boolean; deadline?: string | null };

  try {
    const record = await prisma.record.findFirst({ where: { id: recordId, userId: req.userId, deletedAt: null } });
    if (!record) { res.status(404).json({ error: 'Не найдено' }); return; }

    const data: Record<string, unknown> = {};
    if (typeof body.done === 'boolean') {
      data.done = body.done;
      data.doneAt = body.done ? new Date() : null;
    }
    if ('deadline' in body) {
      data.deadline = body.deadline ?? null;
    }

    const task = await prisma.task.update({ where: { recordId }, data });
    res.json(task);
  } catch (error) {
    console.error('Task update error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

/* ── DELETE ── */
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { allFuture } = req.query as { allFuture?: string };

  try {
    const record = await prisma.record.findFirst({ where: { id, userId: req.userId, deletedAt: null } });
    if (!record) { res.status(404).json({ error: 'Не найдено' }); return; }

    if (allFuture === 'true' && record.routineId) {
       await prisma.record.updateMany({
         where: { 
           routineId: record.routineId, 
           userId: req.userId, 
           createdAt: { gte: record.createdAt },
           deletedAt: null
         },
         data: { deletedAt: new Date() }
       });
    } else {
       await prisma.record.update({ where: { id }, data: { deletedAt: new Date() } });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

/* ── QUICK DONE WEBHOOK ── */
router.get('/tasks/quick-done/:token', async (req: Request, res: Response) => {
  try {
    const payload = jwt.verify(req.params.token as string, process.env.JWT_SECRET!) as { recordId: string };
    await prisma.task.update({ 
      where: { recordId: payload.recordId }, 
      data: { done: true, doneAt: new Date() } 
    });
    res.json({ ok: true });
  } catch(e) {
    res.status(400).json({ error: 'invalid token' });
  }
});

/* ── FULL UPDATE (for editing) ── */
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const { summary, details, amount, score } = req.body;
  try {
    const record = await prisma.record.findFirst({ where: { id, userId: req.userId, deletedAt: null } });
    if (!record) { res.status(404).json({ error: 'Not found' }); return; }

    await prisma.record.update({
      where: { id },
      data: {
        ...(summary !== undefined ? { summary } : {}),
        ...(details !== undefined ? { details } : {}),
      }
    });

    if (amount !== undefined && record.category === 'finance') {
       await prisma.finance.upsert({
         where: { recordId: id },
         create: { recordId: id, amount, type: amount >= 0 ? 'expense' : 'income' },
         update: { amount, type: amount >= 0 ? 'expense' : 'income' }
       });
    }

    if (score !== undefined && record.category === 'mood') {
       await prisma.mood.upsert({
         where: { recordId: id },
         create: { recordId: id, score },
         update: { score }
       });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Update error' });
  }
});

export default router;
