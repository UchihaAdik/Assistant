import { Router } from 'express';
import webpush from 'web-push';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const pubKey = process.env.VAPID_PUBLIC_KEY || '';
const privKey = process.env.VAPID_PRIVATE_KEY || '';

if (pubKey && privKey) {
  webpush.setVapidDetails(
    'mailto:hello@example.com',
    pubKey,
    privKey
  );
} else {
  console.warn('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are missing in .env!');
}

router.get('/vapid-public-key', (req, res) => {
  res.send(pubKey);
});

// Subscribe to push notifications
router.post('/subscribe', async (req: AuthRequest, res) => {
  const subscription = req.body;
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId: req.userId!,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      update: {
        userId: req.userId!,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      }
    });

    res.status(201).json({});
  } catch (error) {
    console.error('Failed to save push subscription', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
