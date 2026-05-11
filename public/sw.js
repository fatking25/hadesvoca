const CACHE_VERSION = 'hadesvoca-cache-v1'
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`
const CONTENT_CACHE = `${CACHE_VERSION}-content`

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
]

const CONTENT_URLS = [
  '/content/stage-metadata.json',
  '/content/words/stage-1.json',
  '/content/conversations/stage-1.json',
]

const CACHE_NAMES = new Set([APP_SHELL_CACHE, CONTENT_CACHE])

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)),
      caches.open(CONTENT_CACHE).then((cache) => cache.addAll(CONTENT_URLS)),
    ]).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((key) => (CACHE_NAMES.has(key) ? undefined : caches.delete(key)))),
      )
      .then(() => self.clients.claim()),
  )
})

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin
}

function isContentRequest(requestUrl) {
  return requestUrl.pathname.startsWith('/content/') && requestUrl.pathname.endsWith('.json')
}

function shouldCacheAsShellAsset(request) {
  return (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image'
  )
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(cacheName)
    await cache.put(request, response.clone())
  }
  return response
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CONTENT_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone())
      }
      return response
    })
    .catch(
      () =>
        cached ||
        new Response('Offline content is not cached yet.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        }),
    )

  return cached || network
}

async function navigationFallback(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(APP_SHELL_CACHE)
      await cache.put('/index.html', response.clone())
    }
    return response
  } catch {
    return (
      (await caches.match('/index.html')) ||
      (await caches.match('/')) ||
      new Response('<!doctype html><title>하데스 보카</title><p>오프라인 상태입니다.</p>', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      })
    )
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (!isSameOrigin(requestUrl)) return

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request))
    return
  }

  if (isContentRequest(requestUrl)) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  if (shouldCacheAsShellAsset(request)) {
    event.respondWith(cacheFirst(request, APP_SHELL_CACHE))
  }
})
