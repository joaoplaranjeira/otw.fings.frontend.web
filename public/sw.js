self.addEventListener('push', event => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch { payload = { body: event.data?.text() || '' } }
  const title = payload.title || 'Fings'
  const actionUrl = payload.actionUrl || payload.url || '/'
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || undefined,
    data: { actionUrl },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const requested = new URL(event.notification.data?.actionUrl || '/', self.location.origin)
  const target = requested.origin === self.location.origin ? requested.href : self.location.origin
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) { await existing.navigate(target); return existing.focus() }
    return self.clients.openWindow(target)
  }))
})
