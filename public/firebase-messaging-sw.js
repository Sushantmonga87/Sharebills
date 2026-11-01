// public/firebase-messaging-sw.js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.stopImmediatePropagation();

  const notificationData = event.notification.data || {};
  const targetUrl = new URL('/', self.location.origin);

  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appClient = windowClients.find((client) => {
      try {
        return new URL(client.url).origin === targetUrl.origin;
      } catch {
        return false;
      }
    });

    if (appClient) {
      appClient.postMessage({
        type: 'PUSH_NOTIFICATION_CLICK',
        data: {
          recipientId: notificationData.recipientId || '',
          groupId: notificationData.groupId || '',
        },
      });
      return appClient.focus();
    }

    return clients.openWindow(targetUrl.href);
  })());
});

importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

firebase.initializeApp({
  
 apiKey: "AIzaSyCwmkMz3DlsJDS2ZwjFHahQok0QURdLuWU",
  authDomain: "roomsplit-test.firebaseapp.com",
  projectId: "roomsplit-test",
  storageBucket: "roomsplit-test.firebasestorage.app",
  messagingSenderId: "814016879682",
  appId: "1:814016879682:web:e0c91d7c3b483ebf16a1db"
});

const messaging = firebase.messaging();

const NAVIGATION_CACHE = 'sharebills-navigation-v1';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(NAVIGATION_CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        await cache.put('/', response.clone());
      }
      return response;
    } catch (error) {
      const cachedAppShell = await cache.match('/');
      if (cachedAppShell) return cachedAppShell;
      throw error;
    }
  })());
});

// Handle notification display when the browser is backgrounded or tab closed
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;

  const title = payload.notification?.title || payload.data?.title || 'Sharebills Alert';
  const options = {
    body: payload.notification?.body || payload.data?.message || 'New activity in your group.',
    icon: '/sharebills-notification-icon.png',
    badge: '/sharebills-notification-badge.png',
    data: {
      url: payload.data?.url || '/',
      recipientId: payload.data?.recipientId || '',
      groupId: payload.data?.groupId || ''
    }
  };

  self.registration.showNotification(title, options);
});
