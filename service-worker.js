// Service Worker Ajarin — jalan di background browser,
// nangkep push notification walau app/tab udah ketutup.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Nangkep push dari server, tampilkan notifikasi
self.addEventListener('push', (event) => {
  let data = { title: 'Ajarin', body: 'Ada notifikasi baru', url: '/dashboard.html' };
  try{
    if(event.data) data = event.data.json();
  }catch(e){
    if(event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    image: data.image || undefined,
    data: { url: data.url || '/dashboard.html' },
    vibrate: [100, 50, 100]
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Waktu notifikasi diklik, buka/fokus ke halaman terkait
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for(const client of clientList){
        if(client.url.includes(url) && 'focus' in client){
          return client.focus();
        }
      }
      if(clients.openWindow){
        return clients.openWindow(url);
      }
    })
  );
});
