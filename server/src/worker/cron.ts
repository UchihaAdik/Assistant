import cron from 'node-cron';
import webpush from 'web-push';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { toYMD, getFutureDates } from '../lib/dateUtils';

export function startCron() {
  console.log('⏳ Starting Background Cron Jobs...');
  
  // Every day at 00:05 AM
  cron.schedule('5 0 * * *', async () => {
    console.log('🔄 Running daily Cron jobs: task maintenance & push notifications');
    try {
      const todayStr = toYMD(new Date());
      const tomorrowD = new Date();
      tomorrowD.setDate(tomorrowD.getDate() + 1);
      const tomorrowStr = toYMD(tomorrowD);

      // 1. Maintenance: Top-up recurring tasks (EduSchool Style)
      const tasksWithRecurrence = await prisma.task.findMany({
        where: { recurrence: { not: null } },
        include: { record: true }
      });

      // Group by routineId. If no routineId, it's an old task, we'll give it one.
      const routinesMap: Record<string, typeof tasksWithRecurrence> = {};
      for (const t of tasksWithRecurrence) {
        let rid = t.record.routineId;
        if (!rid) {
          rid = `legacy-${t.id}`;
          await prisma.record.update({ where: { id: t.recordId }, data: { routineId: rid } });
        }
        if (!routinesMap[rid]) routinesMap[rid] = [];
        routinesMap[rid].push(t);
      }

      for (const rid in routinesMap) {
        const tasks = routinesMap[rid];
        const deadlines = tasks.map(t => t.deadline).filter(Boolean) as string[];
        if (deadlines.length === 0) continue;
        
        const maxDl = deadlines.sort().reverse()[0];
        const maxDate = new Date(maxDl);
        const diffDays = (maxDate.getTime() - Date.now()) / (1000 * 3600 * 24);

        if (diffDays < 14) {
          // Top up 30 days ahead from maxDate
          const sample = tasks[0];
          const newDates = getFutureDates(sample.recurrence!, maxDate, 30, false);
          
          for (const date of newDates) {
            await prisma.record.create({
              data: {
                userId: sample.record.userId,
                category: sample.record.category,
                summary: sample.record.summary,
                details: sample.record.details,
                emoji: sample.record.emoji,
                routineId: rid,
                // We set the base createdAt to the target date to help sorting
                createdAt: new Date(date + 'T12:00:00'),
                task: { create: { deadline: date, recurrence: sample.recurrence } }
              }
            });
            console.log(`[Cron] Top-up routine ${rid}: generated task for ${date}`);
          }
        }
      }

      // 2. Sending Web Push for tomorrow's deadlines
      const pubKey = process.env.VAPID_PUBLIC_KEY;
      const privKey = process.env.VAPID_PRIVATE_KEY;
      if (!pubKey || !privKey) {
        console.warn('Cron Push: VAPID keys are missing.');
        return;
      }
      webpush.setVapidDetails('mailto:hello@example.com', pubKey, privKey);

      const dueTasks = await prisma.task.findMany({
        where: { done: false, deadline: tomorrowStr },
        include: { record: { include: { user: { include: { pushSubscriptions: true } } } } }
      });

      for (const t of dueTasks) {
        const subs = t.record.user.pushSubscriptions;
        if (subs.length === 0) continue;
        const actionToken = jwt.sign({ recordId: t.recordId }, process.env.JWT_SECRET!, { expiresIn: '2d' });
        const payload = JSON.stringify({
          title: 'Напоминание о задаче!',
          body: `Завтра дедлайн: ${t.record.emoji} ${t.record.summary}`,
          actionToken
        });

        for (const sub of subs) {
          try {
            await webpush.sendNotification({
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            }, payload);
          } catch (e: any) {
            if (e.statusCode === 410 || e.statusCode === 404) {
              await prisma.pushSubscription.delete({ where: { id: sub.id } });
            }
          }
        }
      }
    } catch (e) {
      console.error('Daily cron error:', e);
    }
  });
}
