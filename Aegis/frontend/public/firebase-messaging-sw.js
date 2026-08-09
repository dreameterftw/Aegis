importScripts("https://www.gstatic.com/firebasejs/10.12.3/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.3/firebase-messaging-compat.js");

// Firebase config is injected at build time via a meta tag in index.html
// and read here from the service worker's self scope via a query parameter
// set when the SW is registered. This avoids hardcoding secrets in the SW file.
//
// Fallback: read from URL search params passed during SW registration.
function getConfig() {
  try {
    // Vite inlines the config as a global via a <script> in index.html
    // but Service Workers don't have access to the page's DOM.
    // Instead we pass config via the SW registration URL query string.
    const params = new URLSearchParams(self.location.search);
    return {
      apiKey: params.get('apiKey'),
      authDomain: params.get('authDomain'),
      projectId: params.get('projectId'),
      storageBucket: params.get('storageBucket'),
      messagingSenderId: params.get('messagingSenderId'),
      appId: params.get('appId'),
    };
  } catch {
    return null;
  }
}

const config = getConfig();
if (config && config.apiKey && !config.apiKey.startsWith('YOUR_')) {
  firebase.initializeApp(config);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message:', payload);

    const { title, body } = payload.notification || {};
    self.registration.showNotification(title || 'Aegis Alert', {
      body: body || 'New security alert from Aegis',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: 'aegis-alert',
      requireInteraction: true,
      data: payload.data || {},
      actions: [
        { action: 'view', title: 'View Details' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    });
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url && 'focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow('/');
      })
    );
  });
} else {
  console.warn('[Aegis SW] Firebase config not available — background messaging disabled.');
}
