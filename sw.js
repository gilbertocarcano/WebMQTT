self.addEventListener('install', (e) => {
  console.log('[Service Worker] Installato');
});

self.addEventListener('fetch', (e) => {
  // Questo permette all'app di essere considerata PWA anche senza logica di cache complessa
  e.respondWith(fetch(e.request));
});