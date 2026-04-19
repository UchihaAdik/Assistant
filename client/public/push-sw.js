self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Новое уведомление',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: data,
    actions: data.actionToken ? [
      { action: 'mark-done', title: '✅ Выполнил' },
      { action: 'open', title: '📂 Открыть' }
    ] : []
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Ассистент', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const token = event.notification.data?.actionToken;

  if (event.action === 'mark-done' && token) {
    event.waitUntil(
      fetch(new URL('/api/records/tasks/quick-done/' + token, self.location.origin))
        .then(() => self.registration.showNotification('Отлично!', { body: 'Задача отмечена как выполненная.', icon: '/icon-192.png' }))
        .catch(console.error)
    );
  } else {
    event.waitUntil(clients.matchAll({ type: 'window' }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    }));
  }
});
