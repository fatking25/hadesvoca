const CACHE_VERSION = 'hadesvoca-cache-v1'
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`
const CONTENT_CACHE = `${CACHE_VERSION}-content`

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/content-precache.json',
]

const CONTENT_PRECACHE_MANIFEST_URL = '/content-precache.json'
const FALLBACK_CONTENT_URLS = ['/content/stage-metadata.json', '/content/words/stage-1.json', '/audio/ui_click.wav']

const CACHE_NAMES = new Set([APP_SHELL_CACHE, CONTENT_CACHE])

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)),
      precacheContentUrls(),
    ]).then(() => self.skipWaiting()),
  )
})

async function loadContentPrecacheUrls() {
  try {
    const response = await fetch(CONTENT_PRECACHE_MANIFEST_URL, { cache: 'no-store' })
    if (!response.ok) return FALLBACK_CONTENT_URLS
    const manifest = await response.json()
    if (!Array.isArray(manifest.urls)) return FALLBACK_CONTENT_URLS
    return manifest.urls.filter((url) => typeof url === 'string' && url.startsWith('/'))
  } catch {
    return FALLBACK_CONTENT_URLS
  }
}

async function precacheContentUrls() {
  const urls = await loadContentPrecacheUrls()
  const cache = await caches.open(CONTENT_CACHE)
  await cache.addAll(urls)
}

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
  const requestUrl = new URL(request.url)
  return (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    request.destination === 'image' ||
    request.destination === 'audio' ||
    requestUrl.pathname.startsWith('/audio/')
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
