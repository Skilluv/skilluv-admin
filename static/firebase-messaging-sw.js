// Stub Firebase Cloud Messaging SW.
// Skilluv n'utilise PAS Firebase — les push web passent par notre VAPID natif
// dans /service-worker.js. Ce fichier existe uniquement pour éviter les 404
// polluants générés par certaines extensions browser qui cherchent automatiquement
// firebase-messaging-sw.js sur chaque site.
//
// Ne rien faire ici.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
