// Give the service worker access to Firebase Messaging.
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker.
firebase.initializeApp({
  projectId: "poetic-glass-395603",
  appId: "1:125486414083:web:b5f8ef55cdd2c0fa61d136",
  apiKey: "AIzaSyCBCkuaMSg8Lf1ZaKGiyI_eY39YhO7UrFU",
  authDomain: "poetic-glass-395603.firebaseapp.com",
  storageBucket: "poetic-glass-395603.firebasestorage.app",
  messagingSenderId: "125486414083"
});

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'New Message';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message on Zathu.',
    icon: '/logo.png', // Ensure this exists or use a generic one
    badge: '/logo.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const chatId = event.notification.data?.chatId;
  const urlToOpen = new URL(chatId ? `/?chatWith=${event.notification.data.senderId}` : '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
