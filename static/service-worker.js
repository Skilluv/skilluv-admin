/* Skilluv service worker — Phase 4.12 (PWA + Web Push).
   Minimal implementation focused on push notifications and offline shell. */

const VERSION = 'skilluv-sw-v1';
const SHELL = ['/', '/manifest.json'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(VERSION).then((cache) => cache.addAll(SHELL).catch(() => null))
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
		)
	);
	self.clients.claim();
});

self.addEventListener('push', (event) => {
	let data = { title: 'Skilluv', body: '', url: '/', icon: '/icon-192.png' };
	try {
		if (event.data) data = { ...data, ...event.data.json() };
	} catch {
		if (event.data) data.body = event.data.text();
	}
	event.waitUntil(
		self.registration.showNotification(data.title, {
			body: data.body,
			icon: data.icon || '/icon-192.png',
			badge: '/icon-192.png',
			data: { url: data.url || '/' }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const targetUrl = event.notification.data?.url || '/';
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
			for (const c of all) {
				if ('focus' in c) {
					c.navigate(targetUrl);
					return c.focus();
				}
			}
			return self.clients.openWindow(targetUrl);
		})
	);
});
