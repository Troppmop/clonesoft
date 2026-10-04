// Service worker: makes the site installable, keeps it loading on a poor connection, caches the
// Hebrew texts for offline reading, and shows reading reminder push notifications.
const SHELL = 'shell-v1'
const ASSETS = 'assets-v1'
const TEXTS = 'texts-v1'
const CURRENT = [SHELL, ASSETS, TEXTS]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.add('/')).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !CURRENT.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

async function networkFirstPage(request) {
  try {
    const res = await fetch(request)
    if (res.ok) (await caches.open(SHELL)).put('/', res.clone())
    return res
  } catch {
    // Every route serves the same index.html, so the cached copy works for any page
    return (await caches.match('/')) ?? Response.error()
  }
}

async function cacheFirst(cacheName, request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) (await caches.open(cacheName)).put(request, res.clone())
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
  } else if (url.pathname.startsWith('/assets/')) {
    // Built assets have content hashes in their names, so a cached copy is never stale
    event.respondWith(cacheFirst(ASSETS, request))
  } else if (url.pathname === '/api/learning/texts') {
    // Texts never change, and caching them lets portions that were opened once be read offline
    event.respondWith(cacheFirst(TEXTS, request))
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Clonesoft', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (existing) {
        await existing.focus()
        return existing.navigate(target)
      }
      return self.clients.openWindow(target)
    })(),
  )
})
