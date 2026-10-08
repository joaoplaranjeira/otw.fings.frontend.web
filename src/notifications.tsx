import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellDot, BellOff, Check, ChevronRight, LoaderCircle, MonitorSmartphone, Settings, ShieldCheck, Smartphone, TriangleAlert, X } from 'lucide-react'
import { api, ApiError, type FingsNotification, type NotificationChannel, type NotificationPreference, type PushSubscriptionInfo } from './api'

export const notificationTypes = [
  ['Expense.Created', 'Novas despesas', 'Quando alguém regista uma despesa.'],
  ['Expense.Updated', 'Despesas alteradas', 'Quando os dados de uma despesa mudam.'],
  ['Expense.Deleted', 'Despesas eliminadas', 'Quando uma despesa é removida.'],
  ['Budget.UsageChanged', 'Limites do orçamento', 'Quando o orçamento mensal atinge 50%, 80% ou 100%.'],
  ['Budget.ThresholdReached', 'Alertas personalizados', 'Quando uma regra de orçamento atinge o valor que foi configurado.'],
  ['RecurringExpense.Materialized', 'Despesas recorrentes', 'Quando uma recorrência cria movimentos.'],
  ['Household.MemberAdded', 'Novos membros', 'Quando alguém entra no agregado.'],
  ['Household.InvitationAccepted', 'Convites aceites', 'Quando um convite é aceite.'],
] as const

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function relativeDate(value: string) {
  const date = new Date(value)
  const delta = Date.now() - date.getTime()
  if (delta < 60_000) return 'Agora'
  if (delta < 3_600_000) return `Há ${Math.floor(delta / 60_000)} min`
  if (delta < 86_400_000) return `Há ${Math.floor(delta / 3_600_000)} h`
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' }).format(date)
}

function notificationIcon(type: string) {
  if (type.startsWith('Budget.')) return '€'
  if (type.startsWith('Household.')) return 'F'
  if (type.startsWith('RecurringExpense.')) return '↻'
  return '↙'
}

export function NotificationCenter({ token, onNavigate, onOpenSettings }: { token: string; onNavigate: (actionUrl?: string | null, householdId?: string | null) => void; onOpenSettings: () => void }) {
  const [items, setItems] = useState<FingsNotification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const unread = items.filter(item => !item.readAtUtc).length

  async function load(quiet = false) {
    if (!quiet) setLoading(true)
    try { setItems(await api.notifications(token)); setError('') }
    catch (reason) { if (!quiet) setError(errorMessage(reason, 'Não foi possível carregar as notificações.')) }
    finally { if (!quiet) setLoading(false) }
  }

  useEffect(() => {
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load(true) }
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh) }
  }, [token])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  async function select(item: FingsNotification) {
    if (!item.readAtUtc) {
      setItems(current => current.map(entry => entry.id === item.id ? { ...entry, readAtUtc: new Date().toISOString() } : entry))
      try { await api.markNotificationRead(item.id, token) } catch { void load(true) }
    }
    setOpen(false)
    onNavigate(item.actionUrl, item.householdId)
  }

  async function markAllRead() {
    const pending = items.filter(item => !item.readAtUtc)
    if (!pending.length) return
    setItems(current => current.map(item => ({ ...item, readAtUtc: item.readAtUtc || new Date().toISOString() })))
    await Promise.allSettled(pending.map(item => api.markNotificationRead(item.id, token)))
    void load(true)
  }

  return <div className="notification-wrap" ref={ref}>
    <button className={`icon-button notification-trigger ${unread ? 'has-dot' : ''}`} aria-label={unread ? `${unread} notificações por ler` : 'Notificações'} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void load() }}><Bell size={19}/>{unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}</button>
    {open && <section className="notification-popover" role="dialog" aria-label="Notificações">
      <header><div><strong>Notificações</strong><small>{unread ? `${unread} por ler` : 'Estás a par de tudo'}</small></div><button aria-label="Fechar" onClick={() => setOpen(false)}><X/></button></header>
      {unread > 0 && <button className="notifications-read-all" onClick={markAllRead}><Check/> Marcar todas como lidas</button>}
      <div className="notification-list">
        {loading && !items.length ? <div className="notification-state"><LoaderCircle className="spin"/>A carregar…</div> : error ? <div className="notification-state error"><TriangleAlert/>{error}<button onClick={() => load()}>Tentar novamente</button></div> : items.length ? items.map(item => <button key={item.id} className={!item.readAtUtc ? 'unread' : ''} onClick={() => select(item)}><span className="notification-kind">{notificationIcon(item.notificationType)}</span><span><strong>{item.title}</strong><p>{item.body}</p><small>{relativeDate(item.createdAtUtc)}</small></span>{!item.readAtUtc && <i/>}</button>) : <div className="notification-state"><BellOff/><strong>Sem notificações</strong><span>Os avisos do teu agregado aparecem aqui.</span></div>}
      </div>
      <footer><button onClick={() => { setOpen(false); onOpenSettings() }}><Settings/> Gerir notificações <ChevronRight/></button></footer>
    </section>}
  </div>
}

function base64UrlToArray(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const raw = window.atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, character => character.charCodeAt(0))
}

function arrayBufferToBase64(value: ArrayBuffer | null) {
  if (!value) return ''
  const bytes = new Uint8Array(value)
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return window.btoa(binary)
}

function platformInfo() {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const name = ios ? 'iPhone ou iPad' : /Android/i.test(ua) ? 'Android' : 'Este dispositivo'
  return { ios, standalone, supported, name }
}

async function currentBrowserSubscription() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.register('/sw.js')
  return registration.pushManager.getSubscription()
}

export async function removeCurrentPushSubscription(token: string) {
  const browserSubscription = await currentBrowserSubscription().catch(() => null)
  if (!browserSubscription) return
  const subscriptions = await api.pushSubscriptions(token).catch(() => [])
  const record = subscriptions.find(item => item.endpoint === browserSubscription.endpoint && item.isActive)
  if (record) await api.deletePushSubscription(record.id, token).catch(() => undefined)
  await browserSubscription.unsubscribe().catch(() => false)
}

export function NotificationSettings({ householdId, token }: { householdId: string; token: string }) {
  const platform = useMemo(platformInfo, [])
  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [subscriptions, setSubscriptions] = useState<PushSubscriptionInfo[]>([])
  const [browserEndpoint, setBrowserEndpoint] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([api.notificationPreferences(token), api.pushSubscriptions(token), currentBrowserSubscription().catch(() => null)]).then(([nextPreferences, nextSubscriptions, browserSubscription]) => {
      if (!active) return
      setPreferences(nextPreferences); setSubscriptions(nextSubscriptions); setBrowserEndpoint(browserSubscription?.endpoint || '')
    }).catch(reason => { if (active) setError(errorMessage(reason, 'Não foi possível carregar as definições de notificações.')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  const isEnabled = (type: string, channel: NotificationChannel) => preferences.find(item => item.householdId === householdId && item.notificationType === type && item.channel === channel)?.isEnabled ?? true
  const change = (type: string, channel: NotificationChannel, enabled: boolean) => setPreferences(current => {
    const index = current.findIndex(item => item.householdId === householdId && item.notificationType === type && item.channel === channel)
    const next = [...current]
    const item = { householdId, notificationType: type, channel, isEnabled: enabled }
    if (index >= 0) next[index] = item; else next.push(item)
    return next
  })

  async function savePreferences() {
    setSaving(true); setError(''); setSuccess('')
    const items = notificationTypes.flatMap(([type]) => (['InApp', 'WebPush'] as NotificationChannel[]).map(channel => ({ householdId, notificationType: type, channel, isEnabled: isEnabled(type, channel) })))
    try { setPreferences(await api.updateNotificationPreferences(items, token)); setSuccess('Preferências guardadas.') }
    catch (reason) { setError(errorMessage(reason, 'Não foi possível guardar as preferências.')) }
    finally { setSaving(false) }
  }

  async function enablePush() {
    setError(''); setSuccess('')
    if (!platform.supported) { setError('Este browser não suporta notificações push ou a ligação não é segura.'); return }
    if (platform.ios && !platform.standalone) { setError('No iPhone e iPad, instala primeiro a Fings no ecrã principal e abre-a a partir do ícone.'); return }
    setPushBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Bloqueaste as notificações. Ativa-as nas definições do dispositivo.' : 'A permissão para notificações não foi concedida.')
      const registration = await navigator.serviceWorker.register('/sw.js')
      const { publicKey } = await api.pushPublicKey(token)
      if (!publicKey) throw new Error('As notificações push ainda não estão configuradas no servidor.')
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToArray(publicKey) as BufferSource })
      const json = subscription.toJSON()
      const saved = await api.putPushSubscription({ endpoint: subscription.endpoint, p256dh: json.keys?.p256dh || arrayBufferToBase64(subscription.getKey('p256dh')), auth: json.keys?.auth || arrayBufferToBase64(subscription.getKey('auth')), expirationTimeUtc: subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : null, deviceName: platform.name }, token)
      setBrowserEndpoint(subscription.endpoint)
      setSubscriptions(current => [saved, ...current.filter(item => item.id !== saved.id && item.endpoint !== saved.endpoint)])
      setSuccess(`Notificações ativadas em ${platform.name}.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível ativar as notificações neste dispositivo.') }
    finally { setPushBusy(false) }
  }

  async function disablePush() {
    setPushBusy(true); setError(''); setSuccess('')
    try {
      const browserSubscription = await currentBrowserSubscription()
      const record = subscriptions.find(item => item.endpoint === (browserSubscription?.endpoint || browserEndpoint) && item.isActive)
      if (record) await api.deletePushSubscription(record.id, token)
      if (browserSubscription) await browserSubscription.unsubscribe()
      setBrowserEndpoint(''); setSubscriptions(current => current.map(item => item.id === record?.id ? { ...item, isActive: false } : item)); setSuccess('Notificações desativadas neste dispositivo.')
    } catch (reason) { setError(errorMessage(reason, 'Não foi possível desativar as notificações.')) }
    finally { setPushBusy(false) }
  }

  if (loading) return <div className="notification-settings-loading"><LoaderCircle className="spin"/>A carregar notificações…</div>
  const activeHere = Boolean(browserEndpoint && subscriptions.some(item => item.endpoint === browserEndpoint && item.isActive))
  return <div className="notification-settings">
    <section className="push-device-card">
      <div className="push-device-icon"><Smartphone/></div><div className="push-device-copy"><small>ESTE DISPOSITIVO</small><h2>{platform.name}</h2><p>{activeHere ? 'As notificações push estão ativas neste dispositivo.' : platform.ios && !platform.standalone ? 'No iOS, adiciona a Fings ao ecrã principal para poderes receber notificações.' : 'Ativa os avisos mesmo quando a Fings não está aberta.'}</p></div>
      <span className={`push-status ${activeHere ? 'active' : ''}`}><i/>{activeHere ? 'Ativas' : 'Inativas'}</span>
      <button className={activeHere ? 'secondary-button' : 'primary-button'} disabled={pushBusy || !platform.supported} onClick={activeHere ? disablePush : enablePush}>{pushBusy ? <LoaderCircle className="spin"/> : activeHere ? <BellOff/> : <Bell/>}{activeHere ? 'Desativar neste dispositivo' : 'Ativar neste dispositivo'}</button>
    </section>
    {platform.ios && !platform.standalone && <aside className="ios-push-guide"><MonitorSmartphone/><div><strong>Como ativar no iPhone ou iPad</strong><p>No Safari, toca em Partilhar, escolhe “Adicionar ao ecrã principal”, abre a Fings pelo novo ícone e volta a esta página.</p></div></aside>}
    {!platform.supported && <aside className="notification-warning"><TriangleAlert/><span>O Web Push exige HTTPS e um browser compatível. Podes continuar a receber avisos dentro da Fings.</span></aside>}
    {error && <div className="form-error notification-feedback">{error}</div>}{success && <div className="form-success notification-feedback"><Check/>{success}</div>}
    <section className="notification-preferences-card"><header><div><small>O QUE QUERES RECEBER</small><h2>Preferências do agregado</h2><p>Escolhe os avisos que aparecem na Fings e os que chegam ao dispositivo.</p></div><div className="preference-legend"><span className="channel-column-label" tabIndex={0} aria-describedby="in-app-channel-tip"><i><BellDot/></i><strong>Na app</strong><em id="in-app-channel-tip" role="tooltip">Aparece no sino da Fings quando abres a aplicação.</em></span><span className="channel-column-label" tabIndex={0} aria-describedby="push-channel-tip"><i><Smartphone/></i><strong>Push</strong><em id="push-channel-tip" role="tooltip">Aparece no iOS ou Android, mesmo com a Fings fechada.</em></span></div></header><div className="notification-preference-list">{notificationTypes.map(([type, label, description]) => <div className="notification-preference-row" key={type}><span><strong>{label}</strong><small>{description}</small></span><label className="switch" aria-label={`${label}: na app`}><input type="checkbox" checked={isEnabled(type, 'InApp')} onChange={event => change(type, 'InApp', event.target.checked)}/><i/></label><label className="switch" aria-label={`${label}: push`}><input type="checkbox" checked={isEnabled(type, 'WebPush')} onChange={event => change(type, 'WebPush', event.target.checked)}/><i/></label></div>)}</div><footer><span><ShieldCheck/> As preferências aplicam-se apenas à tua conta.</span><button className="primary-button" disabled={saving} onClick={savePreferences}>{saving ? <LoaderCircle className="spin"/> : <Check/>}{saving ? 'A guardar…' : 'Guardar preferências'}</button></footer></section>
  </div>
}
