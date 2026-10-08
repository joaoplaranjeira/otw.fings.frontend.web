import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, Camera, Check, Copy,
  ChevronDown, ChevronRight, CircleHelp, CreditCard, FileText, Grid2X2, Home, Landmark, Link2, Mail,
  LayoutDashboard, LoaderCircle, LogOut, Menu, MoreHorizontal, Plus, ReceiptText,
  Pencil, Play, RefreshCw, Repeat2, Search, Settings, ShieldCheck, ShoppingBasket, Sparkles, Tags, Trash2, TrendingDown, TrendingUp,
  TriangleAlert, Upload, UserPlus, UserRound, UsersRound, Utensils, WalletCards, X,
} from 'lucide-react'
import { api, ApiError, type Budget, type Category, type Dashboard, type Expense, type ExpensePayloadLine, type ExpenseSuggestion, type Household, type HouseholdInvitation, type HouseholdInvitationPreview, type HouseholdMember, type HouseholdRelationship, type HouseholdRole, type ReceiptImageQuality, type ReceiptParseLine, type ReceiptParseResult, type RecurringExpense, type RecurringExpenseMaterialization, type User } from './api'
import { NotificationCenter, NotificationSettings, removeCurrentPushSubscription } from './notifications'

type View = 'overview' | 'expenses' | 'budgets' | 'recurring' | 'help' | 'settings'
type Modal = 'expense' | 'receipt' | 'budget' | 'import' | null

function viewFromLocation():View {
  const requested=new URLSearchParams(window.location.search).get('view')
  if(requested==='expenses')return 'expenses'
  if(requested==='budget'||requested==='budgets')return 'budgets'
  if(requested==='recurring')return 'recurring'
  if(requested==='help')return 'help'
  if(requested==='settings')return 'settings'
  return 'overview'
}

const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const compactEuro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const periodYears = Array.from({ length: 100 }, (_, index) => String(2000 + index))
const periodMonths = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const today=new Date()
const initialPeriod={year:today.getFullYear(),month:today.getMonth()+1}
const initialMonth=`${initialPeriod.year}-${String(initialPeriod.month).padStart(2,'0')}`
const todayIso=`${initialPeriod.year}-${String(initialPeriod.month).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

function formatDate(value?: string | null) {
  const match=value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match?`${match[3]}/${match[2]}/${match[1]}`:''
}

function dateInputValue(value?:string|null) {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]||''
}

function DateInput({value,onChange,required=false,min,max}:{value:string;onChange:(value:string)=>void;required?:boolean;min?:string;max?:string}) {
  const inputRef=useRef<HTMLInputElement>(null)
  const [display,setDisplay]=useState(formatDate(value))
  useEffect(()=>{if(document.activeElement!==inputRef.current)setDisplay(formatDate(value))},[value])
  function parseDisplay(next:string){
    const match=next.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if(!match)return ''
    const iso=`${match[3]}-${match[2]}-${match[1]}`
    const parsed=new Date(`${iso}T12:00:00`)
    return parsed.getFullYear()===Number(match[3])&&parsed.getMonth()+1===Number(match[2])&&parsed.getDate()===Number(match[1])?iso:''
  }
  function change(next:string){
    const digits=next.replace(/\D/g,'').slice(0,8)
    const clean=digits.length<=2?digits:digits.length<=4?`${digits.slice(0,2)}/${digits.slice(2)}`:`${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
    setDisplay(clean)
    const iso=parseDisplay(clean)
    const belowMinimum=!!iso&&!!min&&iso<dateInputValue(min)
    const aboveMaximum=!!iso&&!!max&&iso>dateInputValue(max)
    inputRef.current?.setCustomValidity(clean&&!iso?'Indica uma data válida no formato dia/mês/ano.':belowMinimum?`A data deve ser igual ou posterior a ${formatDate(min)}.`:aboveMaximum?`A data deve ser igual ou anterior a ${formatDate(max)}.`:'')
    if(iso&&!belowMinimum&&!aboveMaximum)onChange(iso)
    else if(!clean)onChange('')
  }
  return <input ref={inputRef} className="date-input" type="text" inputMode="numeric" autoComplete="off" required={required} value={display} placeholder="DD/MM/AAAA" aria-label="Data no formato dia/mês/ano" onChange={event=>change(event.currentTarget.value)} onBlur={()=>{const iso=parseDisplay(display);if(iso)setDisplay(formatDate(iso))}}/>
}

function decimalCharacters(value:string){const clean=value.replace(/,/g,'.').replace(/[^0-9.]/g,'');const dot=clean.indexOf('.');return dot<0?clean:`${clean.slice(0,dot+1)}${clean.slice(dot+1).replace(/\./g,'')}`}

function DecimalInput({value,onChange,currency=false,required=false,placeholder='0.00'}:{value?:number|null;onChange:(value:number|null)=>void;currency?:boolean;required?:boolean;placeholder?:string}) {
  const inputRef=useRef<HTMLInputElement>(null)
  const [display,setDisplay]=useState(value==null||!Number.isFinite(value)?'':String(value))
  useEffect(()=>{if(document.activeElement!==inputRef.current)setDisplay(value==null||!Number.isFinite(value)?'':String(value))},[value])
  const input=<input ref={inputRef} type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" pattern="[0-9]*[.]?[0-9]*" required={required} value={display} placeholder={placeholder} onChange={event=>{const next=decimalCharacters(event.target.value);setDisplay(next);if(!next)onChange(null);else{const parsed=Number(next);onChange(Number.isFinite(parsed)?parsed:null)}}}/>
  return currency?<span className="receipt-money-input"><i>€</i>{input}</span>:input
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : parts[0]?.[1] || ''}`.toUpperCase()
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0] || ''
}

const categoryVisuals: Record<string, { icon: typeof Home; bg: string }> = {
  Alimentação: { icon: ShoppingBasket, bg: '#eeebff' }, Casa: { icon: Home, bg: '#fff1de' },
  Transportes: { icon: CreditCard, bg: '#ddf7f2' }, Lazer: { icon: Sparkles, bg: '#ffe8ef' },
  Saúde: { icon: ShieldCheck, bg: '#e7f2ff' },
}

function Logo() {
  return <div className="logo"><span className="logo-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M8.5 21.5v-5.2M16 21.5V12M23.5 21.5V7.8"/></svg></span><span className="logo-word">fings</span></div>
}

function PoweredBy({ className = '' }: { className?: string }) {
  return <footer className={`powered-by ${className}`.trim()}>powered by <a href="https://www.othub.pt" target="_blank" rel="noreferrer" aria-label="OTW, Lda. — www.othub.pt">OTW, Lda.</a></footer>
}

function invitationCodeFromUrl(){return new URLSearchParams(window.location.search).get('invitationCode')?.trim().toUpperCase()||''}
function clearInvitationFromUrl(){const url=new URL(window.location.href);url.searchParams.delete('invitationCode');window.history.replaceState({},'',`${url.pathname}${url.search}${url.hash}`)}

function Auth({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const initialInvitationCode=invitationCodeFromUrl()
  const [mode, setMode] = useState<'login' | 'register'>(initialInvitationCode?'register':'login')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [invitationFlow,setInvitationFlow]=useState(!!initialInvitationCode)
  const [invitationCode,setInvitationCode]=useState(initialInvitationCode)
  const [invitation,setInvitation]=useState<HouseholdInvitationPreview>()
  const [invitationLoading,setInvitationLoading]=useState(false)
  const [invitationError,setInvitationError]=useState('')
  const [registeredWithInvitation,setRegisteredWithInvitation]=useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', username: '', householdName: '' })

  useEffect(()=>{
    if(!invitationCode){setInvitation(undefined);setInvitationError('');return}
    if(invitationCode.length<8){setInvitation(undefined);setInvitationError('');return}
    const timer=window.setTimeout(()=>{setInvitationLoading(true);setInvitationError('');api.householdInvitation(invitationCode).then(setInvitation).catch(reason=>{setInvitation(undefined);setInvitationError(reason instanceof ApiError&&reason.status===410?'Este convite expirou ou foi revogado.':reason instanceof ApiError&&reason.status===409?'Este convite já foi utilizado.':'Não foi possível validar este código de convite.')}).finally(()=>setInvitationLoading(false))},350)
    return()=>window.clearTimeout(timer)
  },[invitationCode])

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (mode === 'register') {
        await api.register({ name:form.name.trim(),username:form.username.trim(),email:email.trim(),...(invitationFlow?{invitationCode}:{householdName:form.householdName.trim()}) })
        if(invitationFlow){setRegisteredWithInvitation(true);clearInvitationFromUrl()}
        await api.sendOtp(email)
        setMode('login'); setStep('code')
      } else if (step === 'email') {
        await api.sendOtp(email); setStep('code')
      } else {
        const result = await api.validateOtp(email, code)
        if(invitationFlow&&!registeredWithInvitation){await api.acceptHouseholdInvitation(invitationCode,result.token);clearInvitationFromUrl()}
        onAuthenticated(result.token)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível ligar ao servidor.')
    } finally { setLoading(false) }
  }

  return <main className="auth-shell">
    <section className="auth-brand-panel">
      <Logo />
      <div className="auth-pitch">
        <div className="eyebrow"><Sparkles size={14} /> Simples por natureza</div>
        <h1>Dinheiro em ordem.<br /><em>Vida mais leve.</em></h1>
        <p>Uma visão clara das finanças da tua casa, sem folhas de cálculo e sem complicações.</p>
      </div>
      <div className="floating-card fc-main">
        <div className="mini-label"><span>Disponível este mês</span><MoreHorizontal size={18} /></div>
        <strong>Dados não obtidos</strong>
        <div className="mini-progress" />
        <small>Os teus valores aparecerão depois de iniciares sessão.</small>
      </div>
      <div className="floating-card fc-badge"><span className="round-icon"><TrendingUp size={17} /></span><span><small>Análises financeiras</small><strong>Baseadas nos teus dados</strong></span></div>
      <div className="auth-proof"><ShieldCheck size={18}/><span>Finanças claras para toda a família</span></div>
    </section>
    <section className="auth-form-panel">
      <div className="auth-mobile-logo"><Logo /></div>
      <div className="auth-box">
        {step === 'code' && <button className="back-link" onClick={() => setStep('email')}><ArrowLeft size={16} /> Voltar</button>}
        <span className="auth-kicker">{invitationFlow&&step==='email'?'CONVITE PARA A FAMÍLIA':mode === 'register' ? 'COMEÇA AGORA' : step === 'email' ? 'BEM-VINDO DE VOLTA' : 'VERIFICA O TEU EMAIL'}</span>
        <h2>{mode === 'register' ? 'Cria a tua conta' : step === 'email' ? 'Entra na Fings' : 'Introduz o código'}</h2>
        <p className="auth-sub">{step === 'code' ? <>Enviámos um código de 6 dígitos para <strong>{email}</strong>.</> : invitation?<>Foste convidado para <strong>{invitation.householdName}</strong>. Usa o email indicado no convite.</>:mode === 'register' ? 'A tua casa financeira, pronta em menos de um minuto.' : 'Usamos um código seguro — não precisas de palavra-passe.'}</p>
        {invitationFlow&&step==='email'&&<aside className={`auth-invitation ${invitationError?'invalid':''}`}><span>{invitationLoading?<LoaderCircle className="spin"/>:<Mail/>}</span><div><small>CÓDIGO DO CONVITE</small><strong>{invitationLoading?'A validar…':invitation?.householdName||'Convite não validado'}</strong>{invitation&&<p>{invitation.maskedEmail} · {roleLabel((['','Owner','Administrator','Member','Viewer'])[invitation.role])}</p>}{invitationError&&<p>{invitationError}</p>}</div></aside>}
        <form onSubmit={submit}>
          {mode === 'register' && <>
            <label>Nome completo<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="João Santos" /></label>
            <div className="input-pair"><label>Username<input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="joao.santos" /></label>{!invitationFlow&&<label>Nome do agregado<input required value={form.householdName} onChange={e => setForm({ ...form, householdName: e.target.value })} placeholder="Família Santos" /></label>}</div>
          </>}
          {invitationFlow&&step==='email'&&<label>Código do convite<input required autoCapitalize="characters" value={invitationCode} onChange={e=>setInvitationCode(e.target.value.trim().toUpperCase())} placeholder="FINGS-XXXX-XXXX"/></label>}
          {step === 'email' ? <label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@email.pt" /></label> : <label>Código de acesso<input className="otp-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="• • • • • •" /></label>}
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button full" disabled={loading||invitationFlow&&(!invitation||invitationLoading)}>{loading ? <LoaderCircle className="spin" size={18} /> : step === 'code' ? 'Confirmar e entrar' : mode === 'register' ? invitationFlow?'Criar conta e entrar na família':'Criar conta' : 'Receber código'}{!loading && <ArrowRight size={17} />}</button>
        </form>
        {step === 'email' && <>
          <p className="auth-switch">{mode === 'login' ? 'Ainda não tens conta?' : 'Já tens conta?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Criar conta' : 'Entrar'}</button></p>
          <button type="button" className="auth-invite-entry" onClick={()=>{if(invitationFlow){setInvitationFlow(false);setInvitationCode('');setInvitation(undefined);setInvitationError('');setMode('login')}else{setInvitationFlow(true);setMode('register')}setError('')}}>{invitationFlow?<><ArrowLeft/> Continuar sem convite</>:<><Mail/> Tenho um código de convite</>}</button>
        </>}
        <div className="auth-mobile-proof"><ShieldCheck size={15}/><span>Finanças claras para toda a família</span></div>
      </div>
      <PoweredBy className="auth-powered" />
    </section>
  </main>
}

function Sidebar({ view, setView, mobileOpen, close, onLogout }: { view: View; setView: (v: View) => void; mobileOpen: boolean; close: () => void; onLogout: () => void }) {
  const nav = [
    ['overview', LayoutDashboard, 'Visão geral'], ['expenses', ReceiptText, 'Movimentos'],
    ['budgets', WalletCards, 'Orçamentos'], ['recurring', Repeat2, 'Recorrentes'],
  ] as const
  return <><aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
    <div className="sidebar-top"><Logo /><button className="mobile-close" onClick={close}><X /></button></div>
    <nav>{nav.map(([id, Icon, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => { setView(id); close() }}><Icon size={19} /><span>{label}</span>{view === id && <i />}</button>)}</nav>
    <div className="sidebar-bottom"><button className={view === 'help' ? 'active' : ''} onClick={() => { setView('help'); close() }}><CircleHelp size={19} /> Ajuda</button><button className={view === 'settings' ? 'active' : ''} onClick={() => { setView('settings'); close() }}><Settings size={19} /> Definições</button><button onClick={onLogout}><LogOut size={19} /> Terminar sessão</button></div>
  </aside>{mobileOpen && <button aria-label="Fechar menu" className="scrim" onClick={close} />}</>
}

function Topbar({ user, household, households, setHousehold, onMenu, onLogout, token, onNotificationNavigate, onNotificationSettings }: { user: User; household?: Household; households: Household[]; setHousehold: (h: Household) => void; onMenu: () => void; onLogout?: () => void; token:string; onNotificationNavigate:(actionUrl?:string|null,householdId?:string|null)=>void; onNotificationSettings:()=>void }) {
  const [householdOpen, setHouseholdOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileOpen) return
    const closeProfile = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', closeProfile)
    return () => document.removeEventListener('mousedown', closeProfile)
  }, [profileOpen])

  return <header className="topbar">
    <button className="menu-button" onClick={onMenu}><Menu /></button>
    <div className="household-wrap">
      <button className="household-button" onClick={() => setHouseholdOpen(!householdOpen)}><span className="house-avatar">{household?initials(household.name):'—'}</span><span><small>AGREGADO</small><strong>{household?.name || 'Não selecionado'}</strong></span><ChevronDown size={16} /></button>
      {householdOpen && <div className="house-dropdown">{households.map(h => <button key={h.id} onClick={() => { setHousehold(h); setHouseholdOpen(false) }}><span>{h.name.slice(0, 2).toUpperCase()}</span><div><strong>{h.name}</strong><small>{h.currency} · {h.role === 1 ? 'Owner' : 'Membro'}</small></div>{h.id === household?.id && <Check size={16} />}</button>)}</div>}
    </div>
    <div className="top-actions">
      <button className="icon-button"><Search size={19} /></button>
      <NotificationCenter token={token} onNavigate={onNotificationNavigate} onOpenSettings={onNotificationSettings}/>
      <span className="top-divider" />
      <div className="profile-wrap" ref={profileRef}>
        <button className="profile-button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen(open => !open)}><span>{initials(user.name)}</span><div><strong>{shortName(user.name)}</strong><small>@{user.username}</small></div><ChevronDown className={profileOpen ? 'open' : ''} size={15} /></button>
        {profileOpen && <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-head"><strong>{user.name}</strong><small>{user.email}</small></div>
          <div className="profile-dropdown-label">Alterar conta</div>
          {households.map(item => <button key={item.id} role="menuitemradio" aria-checked={item.id === household?.id} onClick={() => { setHousehold(item); setProfileOpen(false) }}><span className="profile-option-avatar">{item.name.slice(0, 2).toUpperCase()}</span><span><strong>{item.name}</strong><small>{item.role === 1 ? 'Owner' : 'Membro'}</small></span>{item.id === household?.id && <Check size={16} />}</button>)}
          <button className="profile-logout" role="menuitem" onClick={() => onLogout ? onLogout() : window.dispatchEvent(new Event('fings:unauthorized'))}><span className="profile-logout-icon"><LogOut size={15}/></span><span className="profile-logout-copy"><strong>Terminar sessão</strong><small>Sair desta conta em segurança</small></span></button>
        </div>}
      </div>
    </div>
  </header>
}

function DataUnavailable({message='Ainda não existem dados suficientes para apresentar esta informação.'}:{message?:string}) {
  return <div className="data-unavailable"><CircleHelp size={17}/><span>{message}</span></div>
}

function MonthNavigator({label,onChange}:{label:string;onChange:(offset:number)=>void}) {
  return <div className="movement-period"><button aria-label="Mês anterior" onClick={()=>onChange(-1)}><ArrowLeft size={15}/></button><div><CalendarDays size={15}/><span>Período</span><strong>{label}</strong></div><button aria-label="Mês seguinte" onClick={()=>onChange(1)}><ArrowRight size={15}/></button></div>
}

function BalanceChart({dashboard,expenses}:{dashboard:Dashboard;expenses:Expense[]}) {
  const monthMatch=dashboard.month.match(/^(\d{4})-(\d{2})/)
  if(!monthMatch||dashboard.budget<=0)return <DataUnavailable message="Define um orçamento mensal para acompanhar a evolução do saldo."/>
  const year=Number(monthMatch[1]);const month=Number(monthMatch[2]);const daysInMonth=new Date(year,month,0).getDate()
  const now=new Date();const isCurrentMonth=now.getFullYear()===year&&now.getMonth()+1===month
  const lastDay=isCurrentMonth?Math.min(now.getDate(),daysInMonth):daysInMonth
  const spentByDay=Array.from({length:daysInMonth+1},()=>0)
  expenses.filter(expense=>expense.status===2).forEach(expense=>{const match=expense.date.match(/^(\d{4})-(\d{2})-(\d{2})/);if(match&&Number(match[1])===year&&Number(match[2])===month)spentByDay[Number(match[3])]+=expense.amount})
  let available=dashboard.budget
  const points=Array.from({length:lastDay},(_,index)=>{const day=index+1;available-=spentByDay[day];return {day,value:available,spent:spentByDay[day]}})
  const width=620,height=112,top=10,bottom=84,left=8,right=612
  const minValue=Math.min(0,...points.map(point=>point.value));const maxValue=Math.max(dashboard.budget,...points.map(point=>point.value));const range=Math.max(1,maxValue-minValue)
  const x=(day:number)=>left+(day-1)/Math.max(1,lastDay-1)*(right-left)
  const y=(value:number)=>top+(maxValue-value)/range*(bottom-top)
  const linePath=points.map((point,index)=>`${index?'L':'M'}${x(point.day).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
  const areaPath=`${linePath} L${x(lastDay).toFixed(1)},${bottom} L${left},${bottom} Z`
  const labelDays=Array.from(new Set([1,Math.max(1,Math.round(lastDay/3)),Math.max(1,Math.round(lastDay*2/3)),lastDay])).sort((a,b)=>a-b)
  const expensePoints=points.filter(point=>point.spent>0)
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="balance-chart-title balance-chart-description"><title id="balance-chart-title">Evolução diária do saldo disponível</title><desc id="balance-chart-description">O saldo começou em {euro.format(dashboard.budget)} e está em {euro.format(points.at(-1)?.value??dashboard.budget)} no dia {lastDay}.</desc><defs><linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7565fc" stopOpacity=".24"/><stop offset="100%" stopColor="#7565fc" stopOpacity=".02"/></linearGradient></defs><line className="balance-grid-line" x1={left} y1={bottom} x2={right} y2={bottom}/><path className="balance-area" d={areaPath}/><path className="balance-line" d={linePath}/>{expensePoints.map(point=><circle className="balance-expense-point" key={point.day} cx={x(point.day)} cy={y(point.value)} r="3"><title>Dia {point.day}: {euro.format(point.value)} disponíveis após {euro.format(point.spent)} em despesas</title></circle>)}<circle className="balance-current-point-halo" cx={x(lastDay)} cy={y(points.at(-1)?.value??dashboard.budget)} r="7"/><circle className="balance-current-point" cx={x(lastDay)} cy={y(points.at(-1)?.value??dashboard.budget)} r="3.5"><title>Saldo disponível: {euro.format(points.at(-1)?.value??dashboard.budget)}</title></circle>{labelDays.map(day=><text className="balance-axis-label" key={day} x={x(day)} y="105" textAnchor={day===1?'start':day===lastDay?'end':'middle'}>{day}</text>)}</svg>
}

function Overview({ dashboard, expenses, categories, user, periodLabel, changePeriod, openModal, setView, refreshing, onRefresh, onCategorySelect }: { dashboard?: Dashboard; expenses: Expense[]; categories: Category[]; user:User; periodLabel:string; changePeriod:(offset:number)=>void; openModal: (m: Modal) => void; setView: (v: View) => void; refreshing:boolean; onRefresh:()=>void; onCategorySelect:(categoryId:string)=>void }) {
  const pct = dashboard?.budget ? Math.min(100, dashboard.confirmedExpenses / dashboard.budget * 100) : null
  const savingRate=dashboard?.plannedIncome ? (dashboard.plannedIncome-dashboard.confirmedExpenses)/dashboard.plannedIncome*100 : null
  const dashboardCategories=dashboard?.categories||[]
  const maxBar = Math.max(...dashboardCategories.map(c => c.spent), 1)
  return <>
    <div className="page-heading"><div><p className="greeting">Olá, {user.name.trim().split(/\s+/)[0]} <span>👋</span></p><h1>Vamos cuidar das tuas finanças.</h1></div><div className="heading-actions"><button className="secondary-button" onClick={() => openModal('receipt')}><Camera size={17} /> Digitalizar talão</button><button className="primary-button" onClick={() => openModal('expense')}><Plus size={17} /> Nova despesa</button></div></div>
    <div className="overview-period"><MonthNavigator label={periodLabel} onChange={changePeriod}/><button type="button" className={`overview-refresh ${refreshing?'refreshing':''}`} aria-label="Atualizar visão geral" onClick={onRefresh} disabled={refreshing}><span><RefreshCw size={16}/></span><div><strong>{refreshing?'A atualizar…':'Atualizar'}</strong><small>Sincronizar dados</small></div></button></div>
    <section className="hero-grid">
      <div className="balance-card">
        <div className="balance-top"><div><span className="card-label">DISPONÍVEL ESTE MÊS</span><div className="money-main">{dashboard?euro.format(dashboard.available):'Dados não obtidos'}</div></div></div>
        <div className="balance-chart">{dashboard?<BalanceChart dashboard={dashboard} expenses={expenses}/>:<DataUnavailable/>}</div>
        <div className="balance-foot"><span><i className="dot purple" /> Disponível</span><span>{dashboard&&dashboard.confirmedExpenses>0?`${euro.format(dashboard.confirmedExpenses)} gastos no período`:'Sem despesas confirmadas no período'}</span></div>
      </div>
      <div className="budget-card">
        <div className="card-head"><div><span className="card-label">ORÇAMENTO MENSAL</span><h3>{dashboard?compactEuro.format(dashboard.budget):'Dados não obtidos'}</h3></div></div>
        {dashboard&&pct!==null?<div className="ring-wrap"><div className="progress-ring" style={{ '--p': `${pct * 3.6}deg` } as React.CSSProperties}><div><strong>{Math.round(pct)}%</strong><small>utilizado</small></div></div><div className="budget-legend"><span><i className="dot coral" /><small>Gasto</small><strong>{euro.format(dashboard.confirmedExpenses)}</strong></span><span><i className="dot pale" /><small>Restante</small><strong>{euro.format(dashboard.available)}</strong></span></div></div>:<DataUnavailable/>}
        <button className="text-button" onClick={() => setView('budgets')}>Ver detalhes do orçamento <ArrowRight size={15} /></button>
      </div>
    </section>
    <section className="metric-grid">
      <div className="metric-card"><span className="metric-icon green"><ArrowDownRight /></span><div><span className="card-label">RECEITAS PLANEADAS</span><strong>{dashboard?euro.format(dashboard.plannedIncome):'Dados não obtidos'}</strong><small>Comparação mensal não disponível</small></div></div>
      <div className="metric-card"><span className="metric-icon red"><ArrowUpRight /></span><div><span className="card-label">DESPESAS</span><strong>{dashboard?euro.format(dashboard.confirmedExpenses):'Dados não obtidos'}</strong><small>Comparação mensal não disponível</small></div></div>
      <div className="metric-card"><span className="metric-icon violet"><TrendingUp /></span><div><span className="card-label">TAXA DE POUPANÇA</span><strong>{savingRate===null?'Dados insuficientes':`${savingRate.toLocaleString('pt-PT',{maximumFractionDigits:1})}%`}</strong><small>{savingRate===null?'É necessário ter receitas planeadas.':'Calculada com as receitas e despesas do mês.'}</small></div></div>
    </section>
    <section className="lower-grid">
      <div className="panel spending-panel">
        <div className="panel-head"><div><h3>Despesas por categoria</h3><p>Onde estás a gastar este mês</p></div><button className="more-button"><MoreHorizontal /></button></div>
        {dashboardCategories.length?<div className="bar-chart">{dashboardCategories.slice(0, 5).map((c, i) => { const cat = categories.find(x => x.id === c.categoryId); return <button type="button" className="bar-column" key={c.categoryId} aria-label={`Ver movimentos da categoria ${c.categoryName}`} onClick={()=>onCategorySelect(c.categoryId)}><div className="bar-value">{compactEuro.format(c.spent)}</div><div className="bar-track"><div style={{ height: `${Math.max(12, c.spent / maxBar * 100)}%`, background: cat?.color || ['#6d5dfc','#ff9f43','#2ec4b6','#ff5c8a'][i] }} /></div><span>{c.categoryName}</span></button>})}</div>:<DataUnavailable message="Ainda não existem despesas categorizadas neste período."/>}
      </div>
      <div className="panel transactions-panel">
        <div className="panel-head"><div><h3>Movimentos recentes</h3><p>As últimas despesas registadas</p></div><button className="text-button" onClick={() => setView('expenses')}>Ver todos <ChevronRight size={15} /></button></div>
        <div className="transaction-list">{expenses.length?expenses.slice(0, 5).map(expense => <Transaction key={expense.id} expense={expense} categories={categories} />):<DataUnavailable message="Ainda não existem movimentos neste período."/>}</div>
      </div>
    </section>
    <section className="insight-banner"><span className="insight-icon"><Sparkles /></span><div><span className="card-label">INSIGHT FINGS</span><h3>Dados insuficientes para gerar uma análise.</h3><p>São necessários dados históricos de vários períodos para calcular tendências e projeções fiáveis.</p></div></section>
  </>
}

function Transaction({ expense, categories }: { expense: Expense; categories: Category[] }) {
  const visual = categoryVisuals[expense.categoryName] || { icon: ReceiptText, bg: '#eef0f5' }
  const Icon = visual.icon
  const color = categories.find(c => c.id === expense.categoryId)?.color || '#6d5dfc'
  const classification=`${expense.categoryName}${expense.subcategoryName ? ` · ${expense.subcategoryName}` : ''}`
  return <div className="transaction"><span className="transaction-icon" style={{ background: visual.bg, color }}><Icon size={18} /></span><div className="transaction-info"><strong>{expense.merchantName || expense.description}</strong><small>{expense.lines?.length>1?`${expense.lines.length} parcelas · ${classification}`:classification}</small></div><div className="transaction-date">{formatDate(expense.date)}</div><strong className="transaction-amount">− {euro.format(expense.amount)}</strong></div>
}

function ExpenseLinesPanel({expense,categories,onEdit,onDelete,deleting}:{expense:Expense;categories:Category[];onEdit:(expense:Expense)=>void;onDelete:(expense:Expense)=>void;deleting:boolean}) {
  const distribution=expense.lines.reduce<{id:string;name:string;amount:number;color:string}[]>((items,line)=>{const existing=items.find(item=>item.id===line.categoryId);if(existing)existing.amount+=line.amount;else items.push({id:line.categoryId,name:line.categoryName,amount:line.amount,color:categories.find(category=>category.id===line.categoryId)?.color||'#6d5dfc'});return items},[])
  const origin=expense.origin===1?'Registo manual':expense.origin===2?'Despesa recorrente':'Talão digitalizado'
  return <section className="expense-detail"><header className="expense-detail-hero"><div className="expense-detail-identity"><span><ReceiptText size={20}/></span><div><small>DETALHE DO MOVIMENTO</small><h3>{expense.merchantName||expense.description}</h3><p>{formatDate(expense.date)} · {origin}</p></div></div><div className="expense-detail-actions"><div className="expense-detail-buttons"><button type="button" onClick={()=>onEdit(expense)} disabled={deleting}><Pencil size={14}/> Editar despesa</button><button type="button" className="danger" onClick={()=>onDelete(expense)} disabled={deleting}>{deleting?<LoaderCircle className="spin" size={14}/>:<Trash2 size={14}/>} {deleting?'A eliminar…':'Eliminar'}</button></div><div className="expense-detail-total"><small>VALOR TOTAL</small><strong>{euro.format(expense.amount)}</strong><span><Check size={12}/> {expense.lines.length} parcela{expense.lines.length===1?'':'s'} conciliada{expense.lines.length===1?'':'s'}</span></div></div></header><div className="expense-detail-body"><section className="expense-distribution"><div className="expense-detail-section-title"><div><span>Distribuição</span><strong>Onde foi aplicado o valor</strong></div><small>{distribution.length} categoria{distribution.length===1?'':'s'}</small></div><div className="expense-distribution-bar" aria-label="Distribuição do valor por categoria">{distribution.map(item=><i key={item.id} title={`${item.name}: ${euro.format(item.amount)}`} style={{width:`${item.amount/expense.amount*100}%`,background:item.color}}/>)}</div><div className="expense-distribution-legend">{distribution.map(item=><div key={item.id}><i style={{background:item.color}}/><span>{item.name}</span><strong>{euro.format(item.amount)}</strong><small>{Math.round(item.amount/expense.amount*100)}%</small></div>)}</div></section><section className="expense-installments"><div className="expense-detail-section-title"><div><span>Parcelas</span><strong>Composição da despesa</strong></div><small>{expense.lines.length} item{expense.lines.length===1?'':'s'}</small></div><div className="expense-installment-list">{expense.lines.map((line,index)=>{const color=categories.find(category=>category.id===line.categoryId)?.color||'#6d5dfc';return <article className="expense-installment" key={line.id}><span className="expense-installment-index">{String(index+1).padStart(2,'0')}</span><div className="expense-installment-main"><strong>{line.description}</strong><span><i style={{background:color}}/>{line.categoryName}{line.subcategoryName&&<em>{line.subcategoryName}</em>}</span></div><div className="expense-installment-math">{line.quantity!=null&&<small>QTD. {line.quantity}</small>}{line.unitPrice!=null&&<span>{line.quantity!=null?'× ':''}{euro.format(line.unitPrice)}</span>}{line.quantity==null&&line.unitPrice==null&&<small>VALOR DIRETO</small>}</div><strong className="expense-installment-amount">{euro.format(line.amount)}</strong></article>})}</div></section></div></section>
}

function ExpensesPage({ expenses, categories, periodLabel, loading, changePeriod, openModal, onEdit, onDelete, selectedCategoryId, onCategoryChange, focusExpenseId }: { expenses: Expense[]; categories: Category[]; periodLabel:string; loading:boolean; changePeriod:(offset:number)=>void; openModal: (m: Modal) => void; onEdit:(expense:Expense)=>void; onDelete:(expense:Expense)=>Promise<void>; selectedCategoryId?:string; onCategoryChange:(categoryId?:string)=>void; focusExpenseId?:string }) {
  const [search, setSearch] = useState('')
  const [expandedExpenseId,setExpandedExpenseId]=useState<string|undefined>(focusExpenseId)
  const [deletingExpenseId,setDeletingExpenseId]=useState<string>()
  const [expenseToDelete,setExpenseToDelete]=useState<Expense>()
  const [deleteError,setDeleteError]=useState('')
  const monthCategories=useMemo(()=>categories.filter(category=>expenses.some(expense=>expense.categoryId===category.id||expense.lines?.some(line=>line.categoryId===category.id))).map(category=>({...category,count:expenses.filter(expense=>expense.categoryId===category.id||expense.lines?.some(line=>line.categoryId===category.id)).length})),[categories,expenses])
  const shown = expenses.filter(e => (!selectedCategoryId||e.categoryId===selectedCategoryId||e.lines?.some(line=>line.categoryId===selectedCategoryId))&&`${e.description} ${e.merchantName} ${e.categoryName} ${e.lines?.map(line=>`${line.description} ${line.categoryName} ${line.subcategoryName||''}`).join(' ')||''}`.toLowerCase().includes(search.toLowerCase()))
  const filtersActive=!!selectedCategoryId||!!search.trim()
  const monthTotal=expenses.reduce((sum,expense)=>sum+(Number.isFinite(expense.amount)?expense.amount:0),0)
  useEffect(()=>{if(focusExpenseId)setExpandedExpenseId(focusExpenseId)},[focusExpenseId])
  async function removeExpense(expense:Expense){
    setDeletingExpenseId(expense.id);setDeleteError('')
    try{await onDelete(expense);setExpandedExpenseId(undefined);setExpenseToDelete(undefined)}
    catch(error){setDeleteError(error instanceof ApiError&&error.status===403?'Não tens permissão para eliminar esta despesa. Apenas quem a criou ou o proprietário da família o pode fazer.':error instanceof ApiError?error.message:'Não foi possível eliminar a despesa.')}
    finally{setDeletingExpenseId(undefined)}
  }
  return <>
    <div className="page-heading">
      <div><p className="section-kicker">MOVIMENTOS</p><h1>Todas as despesas</h1><p className="page-subtitle">Acompanha cada euro, sem perder o fio à meada.</p></div>
      <div className="heading-actions movement-heading-actions"><button className="secondary-button" onClick={() => openModal('import')}><Copy size={16}/> Importar anteriores</button><button className="secondary-button" onClick={() => openModal('receipt')}><Camera size={17} /> Digitalizar talão</button><button className="primary-button" onClick={() => openModal('expense')}><Plus size={17} /> Nova despesa</button></div>
    </div>
    <div className="panel data-panel">
      <div className="table-toolbar">
        <div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar movimentos" /></div>
        <div className="movement-toolbar-summary"><div className="movement-month-total"><span>Total do mês</span><strong>{loading?'—':euro.format(monthTotal)}</strong></div><MonthNavigator label={periodLabel} onChange={changePeriod}/></div>
      </div>
      {!loading&&monthCategories.length>0&&<nav className="movement-category-shortcuts" aria-label="Filtrar movimentos por categoria"><span>Categorias deste mês</span><div><button type="button" className={!selectedCategoryId?'active':''} aria-pressed={!selectedCategoryId} onClick={()=>onCategoryChange(undefined)}>Todas <small>{expenses.length}</small></button>{monthCategories.map(category=><button type="button" key={category.id} className={selectedCategoryId===category.id?'active':''} aria-pressed={selectedCategoryId===category.id} onClick={()=>onCategoryChange(selectedCategoryId===category.id?undefined:category.id)}><i style={{background:category.color||'#6d5dfc'}}/>{category.name}<small>{category.count}</small></button>)}</div></nav>}
      <div className="expense-table"><div className="table-row table-header"><span>Movimento</span><span>Data</span><span>Origem</span><span>Valor</span><span /></div>{loading?<div className="movement-loading"><LoaderCircle className="spin"/><span>A carregar movimentos de {periodLabel}…</span></div>:shown.length?shown.map(e => {const expanded=expandedExpenseId===e.id;return <Fragment key={e.id}><div className={`table-row ${expanded?'expanded':''}`}><span><Transaction expense={e} categories={categories}/></span><span>{formatDate(e.date)}</span><span><i className="origin-pill">{e.origin === 1 ? 'Manual' : e.origin === 2 ? 'Recorrente' : 'Talão'}</i></span><strong>− {euro.format(e.amount)}</strong><button className="expense-lines-toggle" aria-label={`${expanded?'Ocultar':'Ver'} parcelas de ${e.description}`} title={expanded?'Ocultar parcelas':'Ver parcelas'} aria-expanded={expanded} onClick={()=>setExpandedExpenseId(expanded?undefined:e.id)}>{expanded?<ChevronDown size={17}/>:<ChevronRight size={17}/>}</button></div>{expanded&&<ExpenseLinesPanel expense={e} categories={categories} onEdit={onEdit} onDelete={expense=>{setDeleteError('');setExpenseToDelete(expense)}} deleting={deletingExpenseId===e.id}/>}</Fragment>}):<DataUnavailable message={filtersActive?'Nenhum movimento corresponde aos filtros selecionados.':`Ainda não existem movimentos em ${periodLabel}.`}/>}</div>
    </div>
    {expenseToDelete&&<DeleteExpenseModal
      expense={expenseToDelete}
      deleting={deletingExpenseId===expenseToDelete.id}
      error={deleteError}
      onClose={()=>{setExpenseToDelete(undefined);setDeleteError('')}}
      onConfirm={()=>removeExpense(expenseToDelete)}
    />}
  </>
}

function BudgetsPage({ dashboard, budgets, openModal }: { dashboard?: Dashboard; budgets: Budget[]; openModal: (m: Modal) => void }) {
  const current=budgets.find(b=>b.status===1)||budgets[0];const monthly=current?.monthlyAmount??dashboard?.budget;const allocations=dashboard?.categories||[];const allocated=allocations.reduce((n,c)=>n+(c.budget||0),0)
  return <><div className="page-heading"><div><p className="section-kicker">PLANEAMENTO</p><h1>Orçamentos</h1><p className="page-subtitle">Define limites simples e dá intenção ao teu dinheiro.</p></div><button className="primary-button" onClick={() => openModal('budget')}><Plus size={17}/> Novo orçamento</button></div><div className="budget-overview-card"><div>{current&&<span className="status-pill"><i/> {current.status===2?'FECHADO':'ATIVO'}</span>}<h2>{current?.name||'Sem orçamento ativo'}</h2><p>{current ? `${formatDate(current.startMonth)} — ${formatDate(current.endMonth)}` : 'Ainda não existem dados de orçamento.'}</p></div><div className="budget-big-number"><small>POR MÊS</small><strong>{monthly===undefined?'Dados não obtidos':euro.format(monthly)}</strong></div></div><div className="panel allocation-panel"><div className="panel-head"><div><h3>Distribuição mensal</h3><p>{monthly===undefined?'Dados não obtidos':`${euro.format(allocated)} alocados de ${euro.format(monthly)}`}</p></div>{monthly!==undefined&&<span className="allocation-free">{euro.format(monthly-allocated)} livres</span>}</div>{allocations.length?<div className="allocation-list">{allocations.map((c,i) => <div key={c.categoryId}><span className="allocation-dot" style={{background: ['#6d5dfc','#ff9f43','#2ec4b6','#ff5c8a'][i%4]}}/><strong>{c.categoryName}</strong><div className="allocation-bar"><i style={{width: `${Math.min(100,(c.spent/(c.budget || 1))*100)}%`, background: ['#6d5dfc','#ff9f43','#2ec4b6','#ff5c8a'][i%4]}}/></div><span>{euro.format(c.spent)} <small>/ {c.budget===null?'Sem limite':euro.format(c.budget)}</small></span></div>)}</div>:<DataUnavailable message="Ainda não existem dados de distribuição para este orçamento."/>}</div></>
}

function RecurringPage({items,categories,onCreate,onEdit,onMaterialize}:{items:RecurringExpense[];categories:Category[];onCreate:()=>void;onEdit:(item:RecurringExpense)=>void;onMaterialize:(item:RecurringExpense)=>Promise<RecurringExpenseMaterialization>}) {
  const frequency=['','Semanal','Mensal','Trimestral','Anual']
  const [materializingId,setMaterializingId]=useState<string>()
  const [feedback,setFeedback]=useState<{kind:'success'|'error';message:string}>()
  async function materialize(item:RecurringExpense){setMaterializingId(item.id);setFeedback(undefined);try{const result=await onMaterialize(item);setFeedback({kind:'success',message:result.createdCount?`${result.createdCount} movimento${result.createdCount===1?' criado':'s criados'} com sucesso.`:'Não existem movimentos pendentes para criar.'})}catch(error){setFeedback({kind:'error',message:error instanceof ApiError?error.message:'Não foi possível gerar os movimentos pendentes.'})}finally{setMaterializingId(undefined)}}
  return <><div className="page-heading"><div><p className="section-kicker">AUTOMAÇÃO</p><h1>Despesas recorrentes</h1><p className="page-subtitle">Os compromissos regulares, sempre debaixo de olho.</p></div><button className="primary-button" onClick={onCreate}><Plus size={17}/> Nova recorrência</button></div><div className="recurring-summary"><div><Repeat2/><span><small>PREVISTO ESTE MÊS</small><strong>Dados insuficientes</strong></span></div><div><CalendarDays/><span><small>REGRAS ATIVAS</small><strong>{items.filter(item=>item.isActive).length} recorrências</strong></span></div></div>{feedback&&<div className={`recurring-feedback ${feedback.kind}`} role="status">{feedback.kind==='success'?<Check size={16}/>:<TriangleAlert size={16}/>}<span>{feedback.message}</span></div>}<div className="panel recurring-list">{items.length?items.map((item,i) => {const category=categories.find(c=>c.id===item.categoryId)?.name||'Sem categoria';const hasPending=item.isActive&&item.nextOccurrenceDate<=todayIso;return <div className="recurring-row" key={item.id}><span className="merchant-logo" style={{background:['#fff1de','#ffe8ef','#ddf7f2','#e7f2ff'][i%4]}}>{(item.merchantName||item.description).slice(0,1)}</span><div><strong>{item.merchantName||item.description}</strong><small>{item.description} · {category} · Próxima: {formatDate(item.nextOccurrenceDate)}</small></div><span className="schedule-pill"><Repeat2 size={13}/>{frequency[item.frequency]}</span><strong>{euro.format(item.amount)}</strong><div className="recurring-actions">{hasPending&&<button aria-label={`Gerar movimentos pendentes de ${item.description}`} title="Gerar movimentos pendentes" disabled={materializingId===item.id} onClick={()=>materialize(item)}>{materializingId===item.id?<LoaderCircle className="spin"/>:<Play/>}</button>}<button aria-label={`Editar ${item.description}`} title="Editar" onClick={()=>onEdit(item)}><MoreHorizontal/></button></div></div>}):<DataUnavailable message="Ainda não existem despesas recorrentes configuradas."/>}</div></>
}

function ModalShell({ children, onClose, title, subtitle, closeDisabled=false }: { children: React.ReactNode; onClose: () => void; title: string; subtitle: string; closeDisabled?:boolean }) {
  return <div className="modal-layer"><button className="modal-scrim" onClick={onClose} disabled={closeDisabled}/><div className="modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button onClick={onClose} disabled={closeDisabled} aria-label="Fechar"><X/></button></div>{children}</div></div>
}

function DeleteExpenseModal({expense,deleting,error,onClose,onConfirm}:{expense:Expense;deleting:boolean;error:string;onClose:()=>void;onConfirm:()=>void}) {
  return <ModalShell onClose={onClose} closeDisabled={deleting} title="Eliminar despesa" subtitle="Confirma os dados antes de continuar."><div className="delete-expense-confirmation"><div className="delete-expense-warning"><span><Trash2/></span><div><strong>Esta ação é permanente</strong><p>A despesa e todas as suas parcelas serão eliminadas. Não será possível recuperar estes dados.</p></div></div><div className="delete-expense-summary"><div><small>MOVIMENTO</small><strong>{expense.merchantName||expense.description}</strong><span>{formatDate(expense.date)} · {expense.categoryName}</span></div><strong>− {euro.format(expense.amount)}</strong></div><div className="delete-expense-permission"><ShieldCheck/><span>Apenas quem criou esta despesa ou o proprietário da família a pode eliminar.</span></div>{error&&<div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={deleting}>Manter despesa</button><button type="button" className="danger-button" onClick={onConfirm} disabled={deleting}>{deleting?<LoaderCircle className="spin"/>:<Trash2/>} {deleting?'A eliminar…':'Eliminar despesa'}</button></div></div></ModalShell>
}

function ImportExpensesModal({householdId,token,categories,destination,onClose,onImported}:{householdId:string;token:string;categories:Category[];destination:{year:number;month:number};onClose:()=>void;onImported:(count:number)=>void}) {
  const destinationMonth=`${destination.year}-${String(destination.month).padStart(2,'0')}`
  const latestSourceMonth=(()=>{const date=new Date(destination.year,destination.month-2,1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`})()
  const [sourceMonth,setSourceMonth]=useState(latestSourceMonth)
  const [items,setItems]=useState<Expense[]>([])
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(true)
  const [importing,setImporting]=useState(false)
  const [error,setError]=useState('')
  const [feedback,setFeedback]=useState('')
  const destinationLabel=new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(new Date(destination.year,destination.month-1,1))
  const sourceIsValid=sourceMonth<destinationMonth

  useEffect(()=>{
    if(!sourceIsValid){setItems([]);setSelectedIds([]);setLoading(false);setError('Escolhe um mês anterior ao mês de destino.');return}
    let active=true
    const [year,month]=sourceMonth.split('-').map(Number)
    const lastDay=new Date(year,month,0).getDate()
    setLoading(true);setError('');setFeedback('');setSelectedIds([])
    api.expenses(householdId,`${sourceMonth}-01`,`${sourceMonth}-${String(lastDay).padStart(2,'0')}`,token)
      .then(expenses=>{if(active)setItems(expenses.filter(expense=>expense.status===2))})
      .catch(reason=>{if(active){setItems([]);setError(reason instanceof ApiError?reason.message:'Não foi possível carregar as despesas deste mês.')}})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[householdId,sourceIsValid,sourceMonth,token])

  const visibleItems=useMemo(()=>{const term=search.trim().toLowerCase();if(!term)return items;return items.filter(expense=>`${expense.description} ${expense.merchantName||''} ${expense.merchantTaxNumber||''} ${expense.categoryName} ${expense.subcategoryName||''} ${expense.lines.map(line=>`${line.description} ${line.categoryName} ${line.subcategoryName||''}`).join(' ')}`.toLowerCase().includes(term))},[items,search])
  const groups=useMemo(()=>{const grouped=new Map<string,{name:string;color:string;items:Expense[]}>();visibleItems.forEach(expense=>{const lineCategories=[...new Set(expense.lines.map(line=>line.categoryId))];const mixed=lineCategories.length>1;const categoryId=mixed?'mixed':expense.lines[0]?.categoryId||expense.categoryId;const name=mixed?'Várias categorias':expense.lines[0]?.categoryName||expense.categoryName||'Sem categoria';const color=mixed?'#8a839d':categories.find(category=>category.id===categoryId)?.color||'#6d5dfc';const current=grouped.get(categoryId)||{name,color,items:[]};current.items.push(expense);grouped.set(categoryId,current)});return [...grouped.entries()].sort(([,a],[,b])=>a.name.localeCompare(b.name,'pt-PT'))},[categories,visibleItems])
  const selectedTotal=items.filter(item=>selectedIds.includes(item.id)).reduce((sum,item)=>sum+item.amount,0)
  function toggle(ids:string[],checked:boolean){setSelectedIds(current=>checked?[...new Set([...current,...ids])]:current.filter(id=>!ids.includes(id)))}
  function destinationDate(sourceDate:string){const day=Number(sourceDate.match(/^\d{4}-\d{2}-(\d{2})/)?.[1]||1);const safeDay=Math.min(day,new Date(destination.year,destination.month,0).getDate());return `${destinationMonth}-${String(safeDay).padStart(2,'0')}`}
  async function importSelected(){
    const chosen=items.filter(item=>selectedIds.includes(item.id));if(!chosen.length)return
    setImporting(true);setError('');setFeedback('')
    const results=await Promise.allSettled(chosen.map(expense=>api.createExpense(householdId,{categoryId:null,subcategoryId:null,date:destinationDate(expense.date),amount:expense.amount,description:expense.description,merchantName:expense.merchantName||null,merchantTaxNumber:expense.merchantTaxNumber||null,origin:1,lines:expense.lines.map(line=>({categoryId:line.categoryId,subcategoryId:line.subcategoryId||null,description:line.description,quantity:line.quantity??null,unitPrice:line.unitPrice??null,amount:line.amount}))},token)))
    const succeeded=results.flatMap((result,index)=>result.status==='fulfilled'?[chosen[index].id]:[]);const failed=chosen.filter(item=>!succeeded.includes(item.id))
    if(succeeded.length)onImported(succeeded.length)
    if(!failed.length){onClose();return}
    setSelectedIds(failed.map(item=>item.id));setFeedback(`${succeeded.length} despesa${succeeded.length===1?' importada':'s importadas'} com sucesso.`);setError(`Não foi possível importar ${failed.length} despesa${failed.length===1?'':'s'}. Tenta novamente.`);setImporting(false)
  }

  return <ModalShell onClose={onClose} title="Importar despesas" subtitle={`Escolhe despesas anteriores para copiar para ${destinationLabel}.`}><div className="expense-import"><div className="expense-import-controls"><PeriodSelect label="Mês de origem" value={sourceMonth} max={latestSourceMonth} onChange={setSourceMonth}/><div className="expense-import-destination"><small>MÊS DE DESTINO</small><strong><CalendarDays size={15}/>{destinationLabel}</strong><span>As datas mantêm o dia sempre que possível.</span></div></div><div className="expense-import-search"><Search size={16}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Pesquisar por descrição, comerciante ou categoria"/><span>{visibleItems.length} resultado{visibleItems.length===1?'':'s'}</span></div><div className="expense-import-list">{loading?<div className="expense-import-state"><LoaderCircle className="spin"/><span>A carregar despesas anteriores…</span></div>:!sourceIsValid?null:groups.length?groups.map(([groupId,group])=>{const ids=group.items.map(item=>item.id);const allSelected=ids.every(id=>selectedIds.includes(id));return <section className="expense-import-group" key={groupId}><header><button type="button" className={allSelected?'selected':''} aria-pressed={allSelected} onClick={()=>toggle(ids,!allSelected)}><span>{allSelected?<Check size={13}/>:null}</span><i style={{background:group.color}}/><strong>{group.name}</strong><small>{group.items.length}</small></button><strong>{euro.format(group.items.reduce((sum,item)=>sum+item.amount,0))}</strong></header><div>{group.items.map(expense=>{const selected=selectedIds.includes(expense.id);return <label className={selected?'selected':''} key={expense.id}><input type="checkbox" checked={selected} onChange={event=>toggle([expense.id],event.target.checked)}/><span className="expense-import-check">{selected&&<Check size={13}/>}</span><span className="expense-import-name"><strong>{expense.merchantName||expense.description}</strong><small>{expense.description}{expense.subcategoryName?` · ${expense.subcategoryName}`:''}</small></span><span className="expense-import-date">{formatDate(expense.date)}</span><strong className="expense-import-amount">{euro.format(expense.amount)}</strong></label>})}</div></section>}):<div className="expense-import-state"><ReceiptText/><span>{search?'Nenhuma despesa corresponde à pesquisa.':'Não existem despesas confirmadas neste mês.'}</span></div>}</div>{feedback&&<div className="form-success"><Check size={15}/>{feedback}</div>}{error&&<div className="form-error">{error}</div>}<div className="expense-import-footer"><div><span>{selectedIds.length} selecionada{selectedIds.length===1?'':'s'}</span><strong>{euro.format(selectedTotal)}</strong></div><div><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="button" className="primary-button" disabled={!selectedIds.length||importing} onClick={importSelected}>{importing?<LoaderCircle className="spin"/>:<Copy size={15}/>} {importing?'A importar…':selectedIds.length?`Importar ${selectedIds.length}`:'Importar'}</button></div></div></div></ModalShell>
}

type ExpenseLineDraft = { description:string; quantity:string; unitPrice:string; amount:string; categoryId:string; subcategoryId:string }

function ExpenseModal({ item, categories, householdId, token, onClose, onSaved }: { item?:Expense; categories: Category[]; householdId: string; token: string; onClose: () => void; onSaved: (expense:Expense) => void }) {
  const firstCategoryId=categories[0]?.id||''
  const [defaultDate]=useState(()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`})
  const [form,setForm]=useState({amount:item?String(item.amount):'',description:item?.description||'',date:item?.date||defaultDate,categoryId:item?.categoryId||firstCategoryId,subcategoryId:item?.subcategoryId||'',merchantName:item?.merchantName||'',merchantTaxNumber:item?.merchantTaxNumber||''})
  const [split,setSplit]=useState(!!item)
  const [lines,setLines]=useState<ExpenseLineDraft[]>(()=>item?.lines.map(line=>({description:line.description,quantity:line.quantity==null?'':String(line.quantity),unitPrice:line.unitPrice==null?'':String(line.unitPrice),amount:String(line.amount),categoryId:line.categoryId,subcategoryId:line.subcategoryId||''}))||[])
  const [saving,setSaving]=useState(false); const [error,setError]=useState('')
  const [suggestions,setSuggestions]=useState<ExpenseSuggestion[]>([])
  const [suggestionsLoading,setSuggestionsLoading]=useState(!item)
  const [suggestionsError,setSuggestionsError]=useState('')
  const [selectedSuggestion,setSelectedSuggestion]=useState('')
  const [suggestionsRequest,setSuggestionsRequest]=useState(0)
  useEffect(()=>{if(item)return;let active=true;setSuggestionsLoading(true);setSuggestionsError('');api.expenseSuggestions(householdId,token).then(items=>{if(active)setSuggestions(items)}).catch(()=>{if(active)setSuggestionsError('Não foi possível obter os atalhos.')}).finally(()=>{if(active)setSuggestionsLoading(false)});return()=>{active=false}},[householdId,item,suggestionsRequest,token])
  useEffect(()=>{
    if(!window.matchMedia('(max-width: 560px)').matches)return
    const selector=split?'.expense-with-lines':'.modal-form:has(.split-expense-button)'
    const formElement=document.querySelector(selector)
    if(!formElement)return
    const focusField=(event:Event)=>{const target=event.target;if(!(target instanceof HTMLInputElement||target instanceof HTMLSelectElement))return;window.setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'center'}),180)}
    const finishWithKeyboard=(event:Event)=>{if(!(event instanceof KeyboardEvent)||event.key!=='Enter'||!(event.target instanceof HTMLInputElement))return;event.preventDefault();event.target.blur()}
    const finishPicker=(event:Event)=>{const target=event.target;if(target instanceof HTMLSelectElement||target instanceof HTMLInputElement&&target.type==='date')window.setTimeout(()=>target.blur(),80)}
    formElement.addEventListener('focusin',focusField);formElement.addEventListener('keydown',finishWithKeyboard);formElement.addEventListener('change',finishPicker)
    return()=>{formElement.removeEventListener('focusin',focusField);formElement.removeEventListener('keydown',finishWithKeyboard);formElement.removeEventListener('change',finishPicker)}
  },[split])
  const selected=categories.find(c=>c.id===form.categoryId)
  const parseAmount=(value:string)=>Number(value.replace(',','.'))
  const parseOptional=(value:string)=>value.trim()===''?null:parseAmount(value)
  const invalidOptional=(value:string)=>{const parsed=parseOptional(value);return parsed!==null&&(!Number.isFinite(parsed)||parsed<=0)}
  const linesTotal=lines.reduce((sum,line)=>sum+(parseAmount(line.amount)||0),0)
  function emptyLine():ExpenseLineDraft{return {description:'',quantity:'',unitPrice:'',amount:'',categoryId:firstCategoryId,subcategoryId:''}}
  function enableSplit(){setSplit(true);setLines([{description:form.description,quantity:'',unitPrice:'',amount:form.amount,categoryId:form.categoryId,subcategoryId:form.subcategoryId},emptyLine()])}
  function updateLine(index:number,changes:Partial<ExpenseLineDraft>){setLines(current=>current.map((line,itemIndex)=>itemIndex===index?{...line,...changes}:line))}
  function applySuggestion(suggestion:ExpenseSuggestion){
    setForm(current=>({...current,description:suggestion.description,merchantName:suggestion.merchantName,merchantTaxNumber:suggestion.merchantTaxNumber||'',categoryId:suggestion.categoryId,subcategoryId:suggestion.subcategoryId||''}))
    setSelectedSuggestion(`${suggestion.merchantName}-${suggestion.merchantTaxNumber||''}-${suggestion.categoryId}-${suggestion.subcategoryId||''}`)
  }
  async function save(e:FormEvent){
    e.preventDefault();setError('')
    const amount=parseAmount(form.amount)
    if(!Number.isFinite(amount)||amount<=0){setError('O valor total deve ser superior a zero.');return}
    let payloadLines:ExpensePayloadLine[]|null=null
    if(split){
      if(lines.length<(item?1:2)){setError(`Adiciona pelo menos ${item?'uma parcela':'duas parcelas'}.`);return}
      if(lines.some(line=>!line.description.trim()||!line.categoryId||!Number.isFinite(parseAmount(line.amount))||parseAmount(line.amount)<=0||invalidOptional(line.quantity)||invalidOptional(line.unitPrice))){setError('Revê a descrição, valores e categoria de todas as parcelas.');return}
      if(Math.round(linesTotal*100)!==Math.round(amount*100)){setError(`A soma das parcelas (${euro.format(linesTotal)}) tem de ser igual ao valor total (${euro.format(amount)}).`);return}
      payloadLines=lines.map(line=>({categoryId:line.categoryId,subcategoryId:line.subcategoryId||null,description:line.description.trim(),quantity:parseOptional(line.quantity),unitPrice:parseOptional(line.unitPrice),amount:parseAmount(line.amount)}))
    }
    setSaving(true)
    try{
      const basePayload={categoryId:split?null:form.categoryId,subcategoryId:split?null:form.subcategoryId||null,date:form.date,amount,description:form.description.trim(),merchantName:form.merchantName.trim()||null,merchantTaxNumber:form.merchantTaxNumber.trim()||null,lines:payloadLines}
      const saved=item?await api.updateExpense(householdId,item.id,basePayload,token):await api.createExpense(householdId,{...basePayload,origin:1},token)
      onSaved(saved);onClose()
    }catch(err){setError(err instanceof ApiError?err.message:`Não foi possível ${item?'atualizar':'registar'} a despesa.`)}finally{setSaving(false)}
  }
  return <ModalShell onClose={onClose} title={item?'Editar despesa':'Nova despesa'} subtitle={item?'Atualiza o movimento e as parcelas na mesma operação.':'Regista um movimento e, se precisares, divide-o por parcelas.'}><form className={`modal-form ${split?'expense-with-lines':''}`} onSubmit={save}>{!item&&!split&&(suggestionsLoading||suggestions.length>0||suggestionsError)&&<section className="expense-suggestions" aria-label="Despesas frequentes"><div className="expense-suggestions-head"><span><Sparkles size={15}/></span><div><strong>Adicionar outra vez</strong><small>Preenche descrição, comerciante, NIF e categoria num toque.</small></div>{suggestionsError&&<button type="button" onClick={()=>setSuggestionsRequest(current=>current+1)}><RefreshCw size={13}/> Tentar de novo</button>}</div>{suggestionsLoading?<div className="expense-suggestions-loading"><LoaderCircle className="spin" size={16}/> A procurar despesas frequentes…</div>:suggestions.length>0&&<div className="expense-suggestion-list">{suggestions.map((suggestion,index)=>{const key=`${suggestion.merchantName}-${suggestion.merchantTaxNumber||''}-${suggestion.categoryId}-${suggestion.subcategoryId||''}`;const active=selectedSuggestion===key;return <button type="button" className={active?'active':''} key={key} aria-pressed={active} onClick={()=>applySuggestion(suggestion)}><span className="expense-suggestion-rank">{String(index+1).padStart(2,'0')}</span><span className="expense-suggestion-copy"><strong>{suggestion.merchantName}</strong><small>{suggestion.categoryName}{suggestion.subcategoryName?` · ${suggestion.subcategoryName}`:''}</small></span><span className="expense-suggestion-meta"><strong>{suggestion.occurrenceCount}×</strong><small>{formatDate(suggestion.lastOccurrenceDate)}</small></span>{active?<Check size={15}/>:<ArrowRight size={15}/>}</button>})}</div>}</section>}<label className="amount-label">Valor total<div className="amount-input"><span>€</span><input autoFocus required inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0,00"/></div></label><div className="input-pair"><label>Descrição<input required maxLength={500} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Ex.: Compras da semana"/></label><label>Data<DateInput required value={form.date} onChange={date=>setForm({...form,date})}/></label></div>{!split&&<div className="input-pair"><label>Categoria<select required value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value,subcategoryId:''})}>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Subcategoria<select value={form.subcategoryId} onChange={e=>setForm({...form,subcategoryId:e.target.value})}><option value="">Sem subcategoria</option>{selected?.subcategories.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label></div>}<div className="input-pair"><label>Comerciante <small>opcional</small><input maxLength={250} value={form.merchantName} onChange={e=>setForm({...form,merchantName:e.target.value})} placeholder="Nome do comerciante"/></label><label>NIF <small>opcional</small><input maxLength={32} value={form.merchantTaxNumber} onChange={e=>setForm({...form,merchantTaxNumber:e.target.value})} placeholder="000 000 000"/></label></div>{split?<section className="expense-lines"><div className="expense-lines-heading"><div><strong>Parcelas da despesa</strong><small>Altera valores, quantidades e classificação.</small></div>{!item&&<button type="button" onClick={()=>{setSplit(false);setLines([])}}>Usar uma só categoria</button>}</div>{lines.map((line,index)=>{const category=categories.find(category=>category.id===line.categoryId);return <div className="expense-line" key={index}><label className="wide">Descrição<input required maxLength={500} value={line.description} onChange={event=>updateLine(index,{description:event.target.value})}/></label><label>Qtd. <small>opcional</small><input inputMode="decimal" value={line.quantity} onChange={event=>updateLine(index,{quantity:event.target.value})}/></label><label>Preço unit. <small>opcional</small><input inputMode="decimal" value={line.unitPrice} onChange={event=>updateLine(index,{unitPrice:event.target.value})}/></label><label>Valor<input required inputMode="decimal" value={line.amount} onChange={event=>updateLine(index,{amount:event.target.value})} placeholder="0,00"/></label><label>Categoria<select required value={line.categoryId} onChange={event=>updateLine(index,{categoryId:event.target.value,subcategoryId:''})}>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Subcategoria<select value={line.subcategoryId} onChange={event=>updateLine(index,{subcategoryId:event.target.value})}><option value="">Sem subcategoria</option>{category?.subcategories.map(subcategory=><option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</select></label><button type="button" aria-label={`Remover parcela ${index+1}`} disabled={lines.length<=(item?1:2)} onClick={()=>setLines(current=>current.filter((_,itemIndex)=>itemIndex!==index))}><Trash2 size={15}/></button></div>})}<div className="expense-lines-footer"><button type="button" onClick={()=>setLines(current=>[...current,emptyLine()])}><Plus size={13}/> Adicionar parcela</button><span className={Math.round(linesTotal*100)===Math.round((parseAmount(form.amount)||0)*100)?'matched':'different'}>Parcelas: <strong>{euro.format(linesTotal)}</strong> / {euro.format(parseAmount(form.amount)||0)}</span></div></section>:<button type="button" className="split-expense-button" onClick={enableSplit}><Plus size={15}/><span><strong>Dividir por parcelas</strong><small>Distribui o total por várias categorias.</small></span></button>}{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Check/>} {saving?'A guardar…':item?'Guardar alterações':'Registar despesa'}</button></div></form></ModalShell>
}

function ReceiptParsedLine({ line, categories }: { line:ReceiptParseLine; categories:Category[] }) {
  const category=categories.find(item=>item.id===line.suggestedCategoryId)
  const subcategory=category?.subcategories.find(item=>item.id===line.suggestedSubcategoryId)
  return <div className="result-line"><div className="result-line-main"><strong>{line.description}</strong><small className={line.confidence<.8?'low-confidence':''}>{Math.round(line.confidence*100)}% confiança</small><div className="ai-category"><Sparkles size={11}/><span>{category?.name||'Categoria não identificada'}</span><i>/</i><span>{subcategory?.name||'Sem subcategoria'}</span></div></div><strong className="result-line-amount">{euro.format(line.amount)}</strong></div>
}

function ReceiptLineEditor({ line, categories, onChange, onRemove, canRemove }: { line:ReceiptParseLine; categories:Category[]; onChange:(line:ReceiptParseLine)=>void; onRemove:()=>void; canRemove:boolean }) {
  const category=categories.find(item=>item.id===line.suggestedCategoryId)
  return <div className="receipt-line-editor">
    <div className="receipt-edit-grid">
      <label className="wide">Descrição<input required enterKeyHint="done" maxLength={500} value={line.description} onChange={event=>onChange({...line,description:event.target.value})}/></label>
      <label>Quantidade<DecimalInput value={line.quantity} onChange={quantity=>onChange({...line,quantity})}/></label>
      <label>Preço unitário<DecimalInput currency value={line.unitPrice} onChange={unitPrice=>onChange({...line,unitPrice})}/></label>
      <label>Valor<DecimalInput currency required value={line.amount} onChange={amount=>onChange({...line,amount:amount??Number.NaN})}/></label>
      <label>Categoria<select required value={line.suggestedCategoryId||''} onChange={event=>{const selected=categories.find(item=>item.id===event.target.value);onChange({...line,suggestedCategoryId:selected?.id||null,suggestedCategoryName:selected?.name||null,suggestedSubcategoryId:null,suggestedSubcategoryName:null})}}><option value="">Selecionar</option>{categories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Subcategoria<select value={line.suggestedSubcategoryId||''} disabled={!category} onChange={event=>{const selected=category?.subcategories.find(item=>item.id===event.target.value);onChange({...line,suggestedSubcategoryId:selected?.id||null,suggestedSubcategoryName:selected?.name||null})}}><option value="">Sem subcategoria</option>{category?.subcategories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div className="receipt-line-footer"><span className={`receipt-confidence ${line.confidence<.8?'low':''}`}><Sparkles size={11}/>{Math.round(line.confidence*100)}% confiança da IA</span><button type="button" onClick={onRemove} disabled={!canRemove}><Trash2 size={13}/> Remover parcela</button></div>
  </div>
}

function ReceiptQualityDecision({ quality, loading, onChooseAnother, onAccept }: { quality:ReceiptImageQuality; loading:boolean; onChooseAnother:()=>void; onAccept:()=>void }) {
  return <section className="receipt-quality-decision" role="alert"><div className="receipt-quality-heading"><span><TriangleAlert/></span><div><small>QUALIDADE DA IMAGEM</small><h3>A fotografia pode não ser suficientemente nítida</h3><p>Podes escolher outra fotografia ou continuar assumindo o risco de existirem dados incorretos.</p></div><strong>{quality.score}<i>/100</i></strong></div><div className="receipt-quality-level"><span>Nível avaliado</span><strong>{quality.level}</strong></div>{quality.warnings.length>0&&<ul>{quality.warnings.map((warning,index)=><li key={`${warning}-${index}`}>{warning}</li>)}</ul>}<div className="receipt-quality-actions"><button type="button" className="secondary-button" onClick={onChooseAnother} disabled={loading}><Camera size={16}/> Escolher outra fotografia</button><button type="button" className="primary-button" onClick={onAccept} disabled={loading}>{loading?<LoaderCircle className="spin"/>:<TriangleAlert size={16}/>} {loading?'A analisar…':'Continuar e assumir o risco'}</button></div></section>
}

function ReceiptModal({ householdId, token, categories, onClose, onCreated }: { householdId:string; token:string; categories:Category[]; onClose:()=>void; onCreated:(item:Expense)=>void }) {
  const inputRef=useRef<HTMLInputElement>(null);const [file,setFile]=useState<File>();const [loading,setLoading]=useState(false);const [result,setResult]=useState<ReceiptParseResult>();const [original,setOriginal]=useState<ReceiptParseResult>();const [editing,setEditing]=useState(false);const [editStep,setEditStep]=useState(0);const [qualityWarning,setQualityWarning]=useState<ReceiptImageQuality>();const [error,setError]=useState('')
  useEffect(()=>{if(!editing)return;const active=document.querySelector('.receipt-stepper .active');const stepper=active?.parentElement;if(!(active instanceof HTMLElement)||!stepper)return;stepper.scrollTo({left:active.offsetLeft-(stepper.clientWidth-active.clientWidth)/2,behavior:'smooth'})},[editStep,editing])
  async function parse(acceptLowQuality=false){if(!file)return;setLoading(true);setError('');try{const parsed=await api.parseReceipt(householdId,file,token,acceptLowQuality);const normalized={...parsed,purchaseDate:dateInputValue(parsed.purchaseDate)||parsed.purchaseDate};setQualityWarning(undefined);setResult(normalized);setOriginal(structuredClone(normalized));setEditing(false);setEditStep(0)}catch(err){if(err instanceof ApiError&&err.status===422&&err.code==='receipt_image_quality_insufficient'&&err.imageQuality)setQualityWarning(err.imageQuality);else setError(err instanceof ApiError?err.message:'Não foi possível analisar o talão.')}finally{setLoading(false)}}
  function chooseAnotherFile(){setFile(undefined);setQualityWarning(undefined);setError('');if(inputRef.current)inputRef.current.value=''}
  function updateLine(index:number,line:ReceiptParseLine){setResult(current=>current?{...current,lines:current.lines.map((item,itemIndex)=>itemIndex===index?line:item)}:current)}
  function addLine(){if(!result)return;const lines=[...result.lines,{description:'',quantity:1,unitPrice:null,amount:0,suggestedCategoryId:null,suggestedCategoryName:null,suggestedSubcategoryId:null,suggestedSubcategoryName:null,confidence:0}];setResult(current=>current?{...current,lines}:current);setEditStep(lines.length);setError('')}
  function removeLine(index:number){if(!result||result.lines.length<=1)return;const lines=result.lines.filter((_,itemIndex)=>itemIndex!==index);setResult(current=>current?{...current,lines}:current);setEditStep(Math.min(index+1,lines.length));setError('')}
  async function confirm(){
    if(!result||!original)return
    setError('')
    if(!result.purchaseDate||!Number.isFinite(result.total)||result.total<=0){setEditing(true);setEditStep(0);setError('Confirma a data e indica um total superior a zero.');return}
    if(!result.lines.length){setEditing(true);setEditStep(0);setError('O talão tem de incluir pelo menos uma parcela.');return}
    const invalidLine=result.lines.findIndex(line=>!line.description.trim()||!line.suggestedCategoryId||!Number.isFinite(line.amount)||line.amount<=0)
    if(invalidLine>=0){setEditing(true);setEditStep(invalidLine+1);setError(`Revê a parcela ${invalidLine+1}: descrição, categoria e valor são obrigatórios.`);return}
    setLoading(true)
    try{
      const changed=JSON.stringify(result)!==JSON.stringify(original)
      const notes=changed?'O utilizador corrigiu o parse antes da confirmação.':null
      const lines:ExpensePayloadLine[]=result.lines.map(line=>({categoryId:line.suggestedCategoryId!,subcategoryId:line.suggestedSubcategoryId||null,description:line.description.trim(),quantity:line.quantity??null,unitPrice:line.unitPrice??null,amount:line.amount}))
      const created=await api.createExpense(householdId,{categoryId:null,subcategoryId:null,date:result.purchaseDate!,amount:result.total,description:result.documentNumber?`Talão ${result.documentNumber}`:result.merchantName?`Talão — ${result.merchantName}`:'Talão',merchantName:result.merchantName||null,merchantTaxNumber:result.merchantTaxNumber||null,origin:3,lines},token)
      onCreated(created);onClose()
      void api.validateReceiptParse(householdId,result.parseId,{isValid:!changed,notes},token).catch(()=>undefined)
    }catch(err){setError(err instanceof ApiError?err.message:'Não foi possível criar a despesa.')}
    finally{setLoading(false)}
  }
  const currentLinesTotal=result?result.lines.reduce((sum,line)=>sum+(Number.isFinite(line.amount)?line.amount:0),0):0
  const safeReceiptTotal=result&&Number.isFinite(result.total)?result.total:0
  const linesDifference=Math.round((safeReceiptTotal-currentLinesTotal)*100)/100
  const totalsMatch=Math.abs(linesDifference)<.01
  const parsedPurchaseDate=dateInputValue(result?.purchaseDate)
  const receiptWarnings=[...new Set([...(result?.warnings||[]),...(parsedPurchaseDate&&parsedPurchaseDate!==todayIso?[`A data identificada no talão (${formatDate(parsedPurchaseDate)}) é diferente da data de hoje (${formatDate(todayIso)}). Confirma se está correta.`]:[])])]
  return <ModalShell onClose={onClose} title="Digitalizar talão" subtitle="Transforma uma fotografia em despesas organizadas.">
    {!result?<div className="receipt-upload">
      {file?qualityWarning?<ReceiptQualityDecision quality={qualityWarning} loading={loading} onChooseAnother={chooseAnotherFile} onAccept={()=>parse(true)}/>:<><div className="file-preview"><FileText/><div><strong>{file.name}</strong><small>{(file.size/1024/1024).toFixed(2)} MB · pronto para analisar</small></div><button onClick={chooseAnotherFile}><X/></button></div><button className="primary-button full" onClick={()=>parse()} disabled={loading}>{loading?<LoaderCircle className="spin"/>:<Sparkles/>}{loading?'A analisar o teu talão…':'Analisar com Fings AI'}</button></>:<button className="drop-zone" onClick={()=>inputRef.current?.click()}><span><Upload/></span><strong>Carrega uma fotografia do talão</strong><small>JPEG, PNG ou WebP · até 10 MB</small><i>Escolher ficheiro</i></button>}
      <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{setFile(event.target.files?.[0]);setQualityWarning(undefined);setError('')}}/>{error&&<div className="form-error">{error}</div>}<div className="privacy-note"><ShieldCheck/>A imagem é processada em segurança e não fica guardada.</div>
    </div>:<div className={`receipt-result ${editing?'editing':''}`}>
      {editing?<><div className="receipt-edit-heading"><div><span><Pencil size={15}/></span><div><strong>Rever dados extraídos</strong><small>{editStep===0?'Passo 1 · Dados gerais do talão':`Passo ${editStep+1} · Parcela ${editStep} de ${result.lines.length}`}</small></div></div><span className="receipt-currency-badge">€ EUR</span></div><nav className="receipt-stepper" aria-label="Passos da revisão"><button className={editStep===0?'active':''} onClick={()=>{setEditStep(0);setError('')}}><span>1</span><strong>Talão</strong></button>{result.lines.map((_,index)=><button key={index} className={editStep===index+1?'active':''} aria-label={`Parcela ${index+1}`} onClick={()=>{setEditStep(index+1);setError('')}}><span>{index+2}</span><strong>Parcela {index+1}</strong></button>)}</nav><section className="receipt-step-card">{editStep===0?<><div className="receipt-step-title"><div><strong>Dados gerais</strong><small>Confirma a loja, a data e os totais.</small></div></div><div className="receipt-edit-header"><label>Loja ou comerciante<input value={result.merchantName||''} onChange={event=>setResult({...result,merchantName:event.target.value})}/></label><label>NIF<input value={result.merchantTaxNumber||''} onChange={event=>setResult({...result,merchantTaxNumber:event.target.value})}/></label><label>N.º documento<input value={result.documentNumber||''} onChange={event=>setResult({...result,documentNumber:event.target.value})}/></label><label>Data<DateInput required value={result.purchaseDate||''} onChange={purchaseDate=>setResult({...result,purchaseDate})}/></label><label>Subtotal<DecimalInput currency value={result.subtotal} onChange={subtotal=>setResult({...result,subtotal})}/></label><label>IVA<DecimalInput currency value={result.tax} onChange={tax=>setResult({...result,tax})}/></label><label className="receipt-total-field">Total<DecimalInput currency required value={result.total} onChange={total=>setResult({...result,total:total??0})}/></label></div></>:<><div className="receipt-step-title"><div><strong>Parcela {editStep} de {result.lines.length}</strong><small>Confirma a descrição, o valor e a categoria.</small></div><button type="button" onClick={addLine}><Plus size={13}/> Adicionar parcela</button></div>{result.lines[editStep-1]&&<ReceiptLineEditor line={result.lines[editStep-1]} categories={categories} onChange={updated=>updateLine(editStep-1,updated)} onRemove={()=>removeLine(editStep-1)} canRemove={result.lines.length>1}/>}</>}<div className="receipt-step-navigation"><button type="button" className="secondary-button" disabled={editStep===0} onClick={()=>{setEditStep(step=>Math.max(0,step-1));setError('')}}><ArrowLeft size={15}/> Anterior</button>{editStep<result.lines.length&&<button type="button" className="secondary-button" onClick={()=>{setEditStep(step=>step+1);setError('')}}>Seguinte <ArrowRight size={15}/></button>}</div></section></>:<><div className="result-merchant"><span><Check/></span><div><small>TALÃO ANALISADO</small><h3>{result.merchantName||'Comerciante não identificado'}</h3><p>{formatDate(result.purchaseDate)}{result.merchantTaxNumber?` · NIF ${result.merchantTaxNumber}`:''}{result.documentNumber?` · ${result.documentNumber}`:''}</p></div><strong>{euro.format(result.total)}</strong></div><div className="result-lines">{result.lines.map((line,index)=><ReceiptParsedLine key={index} line={line} categories={categories}/>)}</div></>}
      <div className={`receipt-totals ${totalsMatch?'matched':'different'}`}><div><span>Total das parcelas</span><strong>{euro.format(currentLinesTotal)}</strong></div><span className="receipt-total-connector"/><div><span>Total do talão</span><strong>{euro.format(result.total)}</strong></div><div className="receipt-total-status">{totalsMatch?<><Check size={14}/><span>Valores coincidentes</span></>:<><TriangleAlert size={14}/><span>Diferença de {euro.format(Math.abs(linesDifference))}</span></>}</div></div>
      {!editing&&receiptWarnings.length>0&&<aside className="receipt-warnings" role="alert"><span className="receipt-warning-icon"><TriangleAlert size={17}/></span><div className="receipt-warning-content"><span className="receipt-warning-label">Revisão recomendada</span><strong>Alguns dados podem precisar da tua atenção</strong><p>Confirma estes pontos antes de criares a despesa.</p><ul>{receiptWarnings.map((warning,index)=><li key={`${warning}-${index}`}>{warning}</li>)}</ul></div></aside>}
      {error&&<div className="form-error">{error}</div>}<div className="modal-actions">{editing?<button className="secondary-button" onClick={()=>{setResult(structuredClone(original));setEditing(false);setEditStep(0);setError('')}}>Cancelar alterações</button>:<><button className="secondary-button" onClick={()=>{setResult(undefined);setOriginal(undefined)}}>Voltar</button><button className="secondary-button" onClick={()=>{setEditing(true);setEditStep(0);setError('')}}><Pencil size={15}/> Rever</button></>}<button className="primary-button" disabled={loading} onClick={confirm}>{loading?<LoaderCircle className="spin"/>:<Check/>} Confirmar e inserir despesas</button></div>
    </div>}
  </ModalShell>
}

function RecurringExpenseModal({ item, categories, householdId, token, onClose, onSaved }: { item?: RecurringExpense; categories: Category[]; householdId: string; token: string; onClose: () => void; onSaved: (item: RecurringExpense) => void }) {
  const defaultStartDate=todayIso
  const [form, setForm] = useState({ categoryId:item?.categoryId||categories[0]?.id||'', subcategoryId:item?.subcategoryId||'', description:item?.description||'', merchantName:item?.merchantName||'', merchantTaxNumber:item?.merchantTaxNumber||'', amount:item?String(item.amount):'', frequency:item?String(item.frequency):'2', startDate:item?.startDate||defaultStartDate, endDate:item?.endDate||'' })
  const [materializeNow,setMaterializeNow]=useState(false);const [saving,setSaving]=useState(false);const [error,setError]=useState('')
  const selected=categories.find(category=>category.id===form.categoryId)
  async function save(event:FormEvent){event.preventDefault();setError('');const amount=Number(form.amount.replace(',','.'));if(!Number.isFinite(amount)||amount<=0){setError('O valor deve ser superior a zero.');return}if(form.endDate&&form.endDate<form.startDate){setError('A data final não pode ser anterior à data inicial.');return}setSaving(true);try{const payload={categoryId:form.categoryId,subcategoryId:form.subcategoryId||undefined,description:form.description.trim(),merchantName:form.merchantName.trim()||undefined,merchantTaxNumber:form.merchantTaxNumber.trim()||undefined,amount,frequency:Number(form.frequency),startDate:form.startDate,endDate:form.endDate||undefined};const saved=item?await api.updateRecurringExpense(householdId,item.id,payload,token):await api.createRecurringExpense(householdId,{...payload,materializeNow:materializeNow&&form.startDate<=defaultStartDate},token);onSaved(saved);onClose()}catch(err){setError(err instanceof ApiError?err.message:`Não foi possível ${item?'atualizar':'criar'} a despesa recorrente.`)}finally{setSaving(false)}}
  return <ModalShell onClose={onClose} title={item?'Editar despesa recorrente':'Nova despesa recorrente'} subtitle={item?'As alterações aplicam-se às próximas ocorrências.':'Automatiza um compromisso regular.'}><form className="modal-form" onSubmit={save}><div className="input-pair"><label>Descrição<input autoFocus required maxLength={500} value={form.description} onChange={event=>setForm({...form,description:event.target.value})} placeholder="Ex.: Internet de casa"/></label><label>Valor<input required inputMode="decimal" value={form.amount} onChange={event=>setForm({...form,amount:event.target.value})} placeholder="0,00"/></label></div><div className="input-pair"><label>Categoria<select required value={form.categoryId} onChange={event=>setForm({...form,categoryId:event.target.value,subcategoryId:''})}>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Subcategoria<select value={form.subcategoryId} onChange={event=>setForm({...form,subcategoryId:event.target.value})}><option value="">Sem subcategoria</option>{selected?.subcategories.map(subcategory=><option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</select></label></div><div className="input-pair"><label>Comerciante <small>opcional</small><input maxLength={250} value={form.merchantName} onChange={event=>setForm({...form,merchantName:event.target.value})} placeholder="Nome do comerciante"/></label><label>NIF <small>opcional</small><input maxLength={32} value={form.merchantTaxNumber} onChange={event=>setForm({...form,merchantTaxNumber:event.target.value})} placeholder="000 000 000"/></label></div><label>Periodicidade<select required value={form.frequency} onChange={event=>setForm({...form,frequency:event.target.value})}><option value="1">Semanal</option><option value="2">Mensal</option><option value="3">Trimestral</option><option value="4">Anual</option></select></label><div className="input-pair"><label>Data inicial<DateInput required value={form.startDate} onChange={startDate=>setForm({...form,startDate})}/></label><label>Data final <small>opcional</small><DateInput min={form.startDate} value={form.endDate} onChange={endDate=>setForm({...form,endDate})}/></label></div>{!item&&form.startDate<=defaultStartDate&&<label className="materialize-option"><input type="checkbox" checked={materializeNow} onChange={event=>setMaterializeNow(event.target.checked)}/><span><strong>Criar agora os movimentos vencidos</strong><small>Cria todas as ocorrências desde a data inicial até hoje, respeitando a periodicidade.</small></span></label>}{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Check/>} {saving?'A guardar…':item?'Guardar alterações':'Criar recorrência'}</button></div></form></ModalShell>
}

function SubcategorySetting({ categoryId, subcategory, householdId, token, onUpdated }: { categoryId:string; subcategory:Category['subcategories'][number]; householdId:string; token:string; onUpdated:(subcategory:Category['subcategories'][number])=>void }) {
  const [name,setName]=useState(subcategory.name);const [saving,setSaving]=useState(false);const [error,setError]=useState('')
  async function save(){const value=name.trim();if(!value||value===subcategory.name)return;setSaving(true);setError('');try{const updated=await api.updateSubcategory(householdId,categoryId,subcategory.id,value,token);onUpdated(updated)}catch(err){setError(err instanceof ApiError?err.message:'Não foi possível atualizar a subcategoria.')}finally{setSaving(false)}}
  return <div className="subcategory-setting"><input aria-label="Nome da subcategoria" maxLength={150} value={name} onChange={event=>setName(event.target.value)}/><button type="button" aria-label={`Guardar ${subcategory.name}`} onClick={save} disabled={saving||!name.trim()||name.trim()===subcategory.name}>{saving?<LoaderCircle className="spin"/>:<Check/>}</button>{error&&<small>{error}</small>}</div>
}

function CategorySetting({ category, householdId, token, onUpdated }: { category:Category; householdId:string; token:string; onUpdated:(category:Category)=>void }) {
  const [editing,setEditing]=useState(false);const [form,setForm]=useState({name:category.name,color:category.color||'#6d5dfc',icon:category.icon||''});const [newSubcategory,setNewSubcategory]=useState('');const [saving,setSaving]=useState(false);const [error,setError]=useState('')
  async function save(event:FormEvent){event.preventDefault();setSaving(true);setError('');try{const payload={name:form.name.trim(),color:form.color,icon:form.icon.trim()||undefined};const updated=await api.updateCategory(householdId,category.id,payload,token);onUpdated(updated);setEditing(false)}catch(err){setError(err instanceof ApiError?err.message:'Não foi possível atualizar a categoria.')}finally{setSaving(false)}}
  async function addSubcategory(){const name=newSubcategory.trim();if(!name)return;setSaving(true);setError('');try{const created=await api.createSubcategory(householdId,category.id,name,token);onUpdated({...category,...form,subcategories:[...category.subcategories,created]});setNewSubcategory('')}catch(err){setError(err instanceof ApiError?err.message:'Não foi possível criar a subcategoria.')}finally{setSaving(false)}}
  function updateSubcategory(updated:Category['subcategories'][number]){onUpdated({...category,...form,subcategories:category.subcategories.map(item=>item.id===updated.id?updated:item)})}
  if(!editing)return <article className="category-fintech-card"><div className="category-card-accent" style={{background:category.color||'#6d5dfc'}}/><div className="category-card-head"><span className="category-card-icon" style={{background:`${category.color||'#6d5dfc'}18`,color:category.color||'#6d5dfc'}}><Tags/></span><button type="button" onClick={()=>setEditing(true)}><Pencil size={15}/> Editar</button></div><h3>{category.name}</h3><p>{category.subcategories.length} subcategoria{category.subcategories.length===1?'':'s'}</p><div className="category-chip-list">{category.subcategories.slice(0,4).map(item=><span key={item.id}>{item.name}</span>)}{category.subcategories.length>4&&<span>+{category.subcategories.length-4}</span>}{!category.subcategories.length&&<span className="empty">Sem subcategorias</span>}</div></article>
  return <form className="category-setting category-setting-edit" onSubmit={save}><div className="category-setting-title"><div><strong>Editar categoria</strong><small>{category.name}</small></div><button type="button" onClick={()=>{setEditing(false);setForm({name:category.name,color:category.color||'#6d5dfc',icon:category.icon||''});setError('')}}><X size={16}/></button></div><div className="category-setting-main"><input className="category-color" aria-label={`Cor de ${category.name}`} type="color" value={form.color} onChange={event=>setForm({...form,color:event.target.value})}/><label>Nome<input required maxLength={150} value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label><label>Ícone<input maxLength={100} value={form.icon} onChange={event=>setForm({...form,icon:event.target.value})} placeholder="Ex.: shopping-cart"/></label><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Check/>} Guardar</button></div><div className="subcategory-settings"><strong>Subcategorias</strong>{category.subcategories.map(subcategory=><SubcategorySetting key={subcategory.id} categoryId={category.id} subcategory={subcategory} householdId={householdId} token={token} onUpdated={updateSubcategory}/>)}<div className="subcategory-add"><input maxLength={150} value={newSubcategory} onChange={event=>setNewSubcategory(event.target.value)} placeholder="Nova subcategoria"/><button type="button" className="secondary-button" onClick={addSubcategory} disabled={saving||!newSubcategory.trim()}><Plus size={15}/> Adicionar</button></div></div>{error&&<div className="form-error">{error}</div>}</form>
}

function CategorySettings({ categories, householdId, token, onChanged }: { categories:Category[]; householdId:string; token:string; onChanged:(categories:Category[])=>void }) {
  const [creating,setCreating]=useState(false);const [form,setForm]=useState({name:'',color:'#6d5dfc',icon:''});const [saving,setSaving]=useState(false);const [error,setError]=useState('')
  async function create(event:FormEvent){event.preventDefault();setSaving(true);setError('');try{const payload={name:form.name.trim(),color:form.color,icon:form.icon.trim()||undefined};const created=await api.createCategory(householdId,payload,token);onChanged([...categories,created]);setForm({name:'',color:'#6d5dfc',icon:''});setCreating(false)}catch(err){setError(err instanceof ApiError?err.message:'Não foi possível criar a categoria.')}finally{setSaving(false)}}
  function update(updated:Category){onChanged(categories.map(category=>category.id===updated.id?updated:category))}
  return <div className="category-settings-view"><div className="settings-section-toolbar"><div><span className="settings-stat">{categories.length}</span><span>categorias ativas</span><span className="settings-dot">·</span><span className="settings-stat">{categories.reduce((total,category)=>total+category.subcategories.length,0)}</span><span>subcategorias</span></div><button className="primary-button" onClick={()=>setCreating(true)}><Plus size={16}/> Nova categoria</button></div>{creating&&<form className="category-create-card" onSubmit={create}><div className="category-setting-title"><div><strong>Nova categoria</strong><small>Define a identidade visual e o nome.</small></div><button type="button" onClick={()=>{setCreating(false);setError('')}}><X size={16}/></button></div><div className="category-create"><input className="category-color" aria-label="Cor da nova categoria" type="color" value={form.color} onChange={event=>setForm({...form,color:event.target.value})}/><input required autoFocus maxLength={150} value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Nome da categoria"/><input maxLength={100} value={form.icon} onChange={event=>setForm({...form,icon:event.target.value})} placeholder="Ícone (opcional)"/><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Plus/>} Criar categoria</button></div>{error&&<div className="form-error category-error">{error}</div>}</form>}<div className="category-fintech-grid">{categories.map(category=><CategorySetting key={category.id} category={category} householdId={householdId} token={token} onUpdated={update}/>)}</div></div>
}

function memberErrorMessage(error: unknown, operation: 'add'|'remove'|'load') {
  if (!(error instanceof ApiError)) return operation==='load'?'Não foi possível carregar os membros.':operation==='add'?'Não foi possível adicionar o membro.':'Não foi possível remover o membro.'
  if(operation==='add'){
    if(error.status===403)return 'Não tens permissão para atribuir este papel.'
    if(error.status===404)return 'Não existe um utilizador ativo com este email.'
    if(error.status===409)return 'Este utilizador já pertence ao agregado.'
    if(error.status===422)return 'Seleciona um papel válido para o novo membro.'
  }
  if(operation==='remove'){
    if(error.status===403)return 'Não tens permissão para remover este membro.'
    if(error.status===404)return 'Este membro já não pertence ao agregado.'
    if(error.status===409)return 'Não é possível deixar o agregado sem proprietário.'
    if(error.status===422)return 'Não podes remover a tua própria associação.'
  }
  return error.message
}

function roleLabel(name?:string){return ({Owner:'Proprietário',Administrator:'Administrador',Member:'Membro',Viewer:'Leitor'} as Record<string,string>)[name||'']||name||'Papel desconhecido'}

function LegacyHouseholdMembersSettings({ user, household, token }: { user:User; household:Household; token:string }) {
  const [members,setMembers]=useState<HouseholdMember[]>([]);const [roles,setRoles]=useState<HouseholdRole[]>([]);const [loading,setLoading]=useState(true);const [adding,setAdding]=useState(false);const [saving,setSaving]=useState(false);const [removingId,setRemovingId]=useState('');const [email,setEmail]=useState('');const [role,setRole]=useState('');const [error,setError]=useState('');const [success,setSuccess]=useState('')
  const currentRoleName=roles.find(item=>item.value===household.role)?.name
  const canManage=currentRoleName==='Owner'||currentRoleName==='Administrator'
  const availableRoles=useMemo(()=>currentRoleName==='Administrator'?roles.filter(item=>item.name==='Member'||item.name==='Viewer'):roles,[currentRoleName,roles])

  useEffect(()=>{let active=true;setLoading(true);setError('');setSuccess('');setAdding(false);Promise.all([api.householdRoles(token),api.householdMembers(household.id,token)]).then(([nextRoles,nextMembers])=>{if(!active)return;setRoles(nextRoles);setMembers(nextMembers)}).catch(reason=>{if(active)setError(memberErrorMessage(reason,'load'))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[household.id,token])
  useEffect(()=>{if(!availableRoles.some(item=>String(item.value)===role))setRole(availableRoles[0]?String(availableRoles[0].value):'')},[availableRoles,role])

  async function addMember(event:FormEvent){event.preventDefault();if(!role)return;setSaving(true);setError('');setSuccess('');try{const created=await api.addHouseholdMember(household.id,{email:email.trim(),role:Number(role)} as never,token);setMembers(current=>[...current,created]);setEmail('');setAdding(false);setSuccess(`${created.name} foi adicionado ao agregado.`)}catch(reason){setError(memberErrorMessage(reason,'add'))}finally{setSaving(false)}}
  async function removeMember(member:HouseholdMember){if(!window.confirm(`Remover ${member.name} do agregado ${household.name}?`))return;setRemovingId(member.id);setError('');setSuccess('');try{await api.removeHouseholdMember(household.id,member.id,token);setMembers(current=>current.filter(item=>item.id!==member.id));setSuccess(`${member.name} foi removido do agregado.`)}catch(reason){setError(memberErrorMessage(reason,'remove'))}finally{setRemovingId('')}}
  function canRemove(member:HouseholdMember){if(member.userId===user.id)return false;const memberRole=roles.find(item=>item.value===member.role)?.name;return currentRoleName==='Owner'||currentRoleName==='Administrator'&&(!member.userId||memberRole==='Member'||memberRole==='Viewer')}

  if(loading)return <div className="members-loading"><LoaderCircle className="spin"/><span>A carregar membros do agregado…</span></div>
  return <div className="members-settings-view"><div className="settings-section-toolbar members-toolbar"><div><span className="settings-stat">{members.length}</span><span>membro{members.length===1?'':'s'} em {household.name}</span></div>{canManage&&<button className="primary-button" onClick={()=>{setAdding(true);setError('');setSuccess('')}} disabled={adding}><UserPlus size={16}/> Adicionar membro</button>}</div>{error&&<div className="form-error members-feedback">{error}</div>}{success&&<div className="form-success members-feedback"><Check size={15}/>{success}</div>}{adding&&<form className="member-add-card" onSubmit={addMember}><div className="category-setting-title"><div><strong>Adicionar membro</strong><small>O utilizador deve já estar registado e ativo na Fings.</small></div><button type="button" aria-label="Cancelar" onClick={()=>{setAdding(false);setError('')}}><X size={16}/></button></div><div className="member-add-form"><label>Email<input autoFocus required type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="nome@email.pt"/></label><label>Papel<select required value={role} onChange={event=>setRole(event.target.value)}>{availableRoles.map(item=><option key={item.value} value={item.value}>{roleLabel(item.name)}</option>)}</select></label><button className="primary-button" disabled={saving||!role}>{saving?<LoaderCircle className="spin"/>:<UserPlus/>}{saving?'A adicionar…':'Adicionar'}</button></div></form>}<section className="members-list" aria-label="Membros do agregado">{members.map(member=>{const memberRole=roles.find(item=>item.value===member.role);const ownMember=member.userId===user.id;return <article className="member-row" key={member.id}><span className="member-avatar">{initials(member.name)}</span><div className="member-identity"><div><strong>{member.name}</strong>{ownMember&&<span className="member-you">Tu</span>}</div><small>@{member.username} · {member.email}</small></div><span className={`member-role role-${memberRole?.name.toLowerCase()||'unknown'}`}>{roleLabel(memberRole?.name)}</span><span className={`member-status ${member.isActive?'active':''}`}><i/>{member.isActive?'Ativo':'Inativo'}</span>{canRemove(member)?<button className="member-remove" aria-label={`Remover ${member.name}`} onClick={()=>removeMember(member)} disabled={removingId===member.id}>{removingId===member.id?<LoaderCircle className="spin"/>:<Trash2/>}<span>Remover</span></button>:<span className="member-action-space"/>}</article>})}{!members.length&&<DataUnavailable message="Este agregado ainda não tem membros."/>}</section></div>
}

function invitationErrorMessage(error:unknown){
  if(!(error instanceof ApiError))return 'Não foi possível concluir a operação com o convite.'
  if(error.status===403)return 'Não tens permissão para gerir este convite ou atribuir este papel.'
  if(error.status===404)return 'O convite já não existe.'
  if(error.status===409)return 'Este email já pertence à família ou já tem um convite pendente.'
  if(error.status===410)return 'Este convite expirou ou foi revogado.'
  if(error.status===422)return 'Confirma o email e o papel selecionado.'
  return error.message
}

function householdMemberErrorMessage(error:unknown,operation:'create'|'update'|'remove'){
  if(!(error instanceof ApiError))return operation==='create'?'Não foi possível adicionar o elemento.':operation==='update'?'Não foi possível guardar as alterações.':'Não foi possível remover o elemento.'
  if(error.status===403)return 'Não tens permissão para gerir este elemento da família.'
  if(error.status===404)return operation==='create'?'Não existe uma conta ativa com o email indicado.':'Este elemento já não existe.'
  if(error.status===409)return operation==='create'?'Esta conta já pertence ao agregado.':'Esta alteração deixaria o agregado sem proprietário.'
  if(error.status===422)return 'Revê o nome, o grau familiar, a data de nascimento e a associação à conta.'
  return error.message
}

function memberAge(birthDate?:string|null){
  const match=birthDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);if(!match)return null
  const now=new Date();let age=now.getFullYear()-Number(match[1]);if(now.getMonth()+1<Number(match[2])||now.getMonth()+1===Number(match[2])&&now.getDate()<Number(match[3]))age--
  return Math.max(0,age)
}

function HouseholdMemberEditor({member,relationships,roles,onCancel,onSave,saving}:{member?:HouseholdMember;relationships:HouseholdRelationship[];roles:HouseholdRole[];onCancel:()=>void;onSave:(data:{name:string;relationship:number;birthDate:string;email?:string|null;role?:number|null})=>void;saving:boolean}){
  const editing=!!member
  const [withAccount,setWithAccount]=useState(!!member?.userId)
  const [form,setForm]=useState({name:member?.name||'',relationship:member?.relationship?String(member.relationship):'',birthDate:dateInputValue(member?.birthDate),email:member?.email||'',role:member?.role?String(member.role):roles[0]?String(roles[0].value):''})
  useEffect(()=>{if(!roles.some(item=>String(item.value)===form.role))setForm(current=>({...current,role:roles[0]?String(roles[0].value):''}))},[form.role,roles])
  function submit(event:FormEvent){event.preventDefault();onSave({name:form.name.trim(),relationship:Number(form.relationship),birthDate:form.birthDate,...(!editing&&withAccount?{email:form.email.trim(),role:Number(form.role)}:editing&&member?.userId?{role:Number(form.role)}:{email:null,role:null})})}
  return <form className="family-member-editor" onSubmit={submit}><div className="family-editor-head"><div><span>{editing?<Pencil/>:<UserPlus/>}</span><div><strong>{editing?'Editar elemento':'Adicionar elemento à família'}</strong><small>{editing?'Atualiza os dados pessoais e o grau familiar.':'Pode representar uma criança ou outra pessoa sem conta Fings.'}</small></div></div><button type="button" aria-label="Fechar" onClick={onCancel}><X/></button></div>{!editing&&<label className="family-account-toggle"><input type="checkbox" checked={withAccount} onChange={event=>setWithAccount(event.target.checked)}/><span><strong>Associar uma conta Fings existente</strong><small>Ativa apenas se esta pessoa já tiver uma conta e precisar de acesso à aplicação.</small></span></label>}<div className="family-editor-grid"><label className="wide">Nome completo<input required maxLength={200} value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Nome do elemento"/></label><label>Grau familiar<select required value={form.relationship} onChange={event=>setForm({...form,relationship:event.target.value})}><option value="">Selecionar</option>{relationships.map(item=><option key={item.value} value={item.value}>{item.name}</option>)}</select></label><label>Data de nascimento<DateInput required max={todayIso} value={form.birthDate} onChange={birthDate=>setForm({...form,birthDate})}/></label>{!editing&&withAccount&&<label className="wide">Email da conta<input required type="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} placeholder="nome@email.pt"/></label>}{(editing&&member?.userId||!editing&&withAccount)&&<label className="wide">Papel de acesso<select required value={form.role} onChange={event=>setForm({...form,role:event.target.value})}>{roles.map(item=><option key={item.value} value={item.value}>{roleLabel(item.name)}</option>)}</select></label>}</div><div className="family-editor-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Check/>}{saving?'A guardar…':editing?'Guardar alterações':'Adicionar à família'}</button></div></form>
}

function HouseholdMembersSettings({ user, household, token }: { user:User; household:Household; token:string }) {
  const [members,setMembers]=useState<HouseholdMember[]>([])
  const [roles,setRoles]=useState<HouseholdRole[]>([])
  const [relationships,setRelationships]=useState<HouseholdRelationship[]>([])
  const [invitations,setInvitations]=useState<HouseholdInvitation[]>([])
  const [creating,setCreating]=useState(false)
  const [addingMember,setAddingMember]=useState(false)
  const [editingMember,setEditingMember]=useState<HouseholdMember>()
  const [sharing,setSharing]=useState<HouseholdInvitation>()
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [memberSaving,setMemberSaving]=useState(false)
  const [actionId,setActionId]=useState('')
  const [removingId,setRemovingId]=useState('')
  const [email,setEmail]=useState('')
  const [role,setRole]=useState('')
  const [copied,setCopied]=useState<'code'|'link'>()
  const [error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const canManage=household.role===1||household.role===2
  const currentRoleName=roles.find(item=>item.value===household.role)?.name
  const availableRoles=useMemo(()=>currentRoleName==='Administrator'?roles.filter(item=>item.name==='Member'||item.name==='Viewer'):roles,[currentRoleName,roles])

  useEffect(()=>{let active=true;setLoading(true);setError('');Promise.all([api.householdRoles(token),api.householdRelationships(token),api.householdMembers(household.id,token),canManage?api.householdInvitations(household.id,token):Promise.resolve([])]).then(([nextRoles,nextRelationships,nextMembers,nextInvitations])=>{if(!active)return;setRoles(nextRoles);setRelationships(nextRelationships);setMembers(nextMembers);setInvitations(nextInvitations)}).catch(reason=>{if(active)setError(memberErrorMessage(reason,'load'))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[canManage,household.id,token])
  useEffect(()=>{if(!availableRoles.some(item=>String(item.value)===role))setRole(availableRoles[0]?String(availableRoles[0].value):'')},[availableRoles,role])

  async function createInvitation(event:FormEvent){event.preventDefault();if(!role)return;setSaving(true);setError('');setSuccess('');try{const created=await api.createHouseholdInvitation(household.id,{email:email.trim(),role:Number(role)},token);setInvitations(current=>[created,...current]);setSharing(created);setCreating(false);setEmail('');setSuccess('Convite criado. Partilha o código ou envia-o por email.')}catch(reason){setError(invitationErrorMessage(reason))}finally{setSaving(false)}}
  async function sendEmail(invitation:HouseholdInvitation){setActionId(invitation.id);setError('');setSuccess('');try{const result=await api.sendHouseholdInvitationEmail(household.id,invitation.id,token);setInvitations(current=>current.map(item=>item.id===invitation.id?{...item,emailSent:result.emailSent}:item));setSharing(current=>current?.id===invitation.id?{...current,emailSent:result.emailSent}:current);if(result.emailSent)setSuccess(`Convite enviado para ${result.email}.`);else setError('O convite continua válido, mas o email não foi entregue. Tenta novamente ou partilha o link por outro canal.')}catch(reason){setError(invitationErrorMessage(reason))}finally{setActionId('')}}
  async function regenerate(invitation:HouseholdInvitation){setActionId(invitation.id);setError('');setSuccess('');try{const renewed=await api.regenerateHouseholdInvitation(household.id,invitation.id,token);setInvitations(current=>current.map(item=>item.id===invitation.id?renewed:item));setSharing(renewed);setSuccess('Foi criado um novo código. O código anterior deixou de funcionar.')}catch(reason){setError(invitationErrorMessage(reason))}finally{setActionId('')}}
  async function revoke(invitation:HouseholdInvitation){if(!window.confirm(`Revogar o convite enviado para ${invitation.email}?`))return;setActionId(invitation.id);setError('');setSuccess('');try{await api.revokeHouseholdInvitation(household.id,invitation.id,token);setInvitations(current=>current.map(item=>item.id===invitation.id?{...item,status:4}:item));if(sharing?.id===invitation.id)setSharing(undefined);setSuccess('O convite foi revogado.')}catch(reason){setError(invitationErrorMessage(reason))}finally{setActionId('')}}
  async function copySecret(kind:'code'|'link',value?:string){if(!value)return;try{await navigator.clipboard.writeText(value);setCopied(kind);window.setTimeout(()=>setCopied(undefined),1800)}catch{setError('Não foi possível copiar automaticamente. Seleciona e copia o conteúdo manualmente.')}}
  async function createMember(data:{name:string;relationship:number;birthDate:string;email?:string|null;role?:number|null}){setMemberSaving(true);setError('');setSuccess('');try{const created=await api.addHouseholdMember(household.id,data,token);setMembers(current=>[...current,created]);setAddingMember(false);setSuccess(`${created.name} foi adicionado à composição familiar.`)}catch(reason){setError(householdMemberErrorMessage(reason,'create'))}finally{setMemberSaving(false)}}
  async function updateMember(data:{name:string;relationship:number;birthDate:string;role?:number|null}){if(!editingMember)return;setMemberSaving(true);setError('');setSuccess('');try{const updated=await api.updateHouseholdMember(household.id,editingMember.id,data,token);setMembers(current=>current.map(item=>item.id===updated.id?updated:item));setEditingMember(undefined);setSuccess(`Os dados de ${updated.name} foram atualizados.`)}catch(reason){setError(householdMemberErrorMessage(reason,'update'))}finally{setMemberSaving(false)}}
  async function removeMember(member:HouseholdMember){if(!window.confirm(`Remover ${member.name} do agregado ${household.name}?`))return;setRemovingId(member.id);setError('');setSuccess('');try{await api.removeHouseholdMember(household.id,member.id,token);setMembers(current=>current.filter(item=>item.id!==member.id));setSuccess(`${member.name} foi removido do agregado.`)}catch(reason){setError(householdMemberErrorMessage(reason,'remove'))}finally{setRemovingId('')}}
  function canEdit(member:HouseholdMember){if(currentRoleName==='Owner')return true;if(currentRoleName!=='Administrator')return false;const memberRole=roles.find(item=>item.value===member.role)?.name;return !member.userId||memberRole==='Member'||memberRole==='Viewer'}
  function canRemove(member:HouseholdMember){if(member.userId===user.id)return false;const memberRole=roles.find(item=>item.value===member.role)?.name;return currentRoleName==='Owner'||currentRoleName==='Administrator'&&(!member.userId||memberRole==='Member'||memberRole==='Viewer')}

  if(loading)return <div className="members-loading"><LoaderCircle className="spin"/><span>A carregar a família…</span></div>
  return <div className="members-settings-view">
    <div className="settings-section-toolbar members-toolbar"><div><span className="settings-stat">{members.length}</span><span>elemento{members.length===1?'':'s'}</span><span className="settings-dot">·</span><span className="settings-stat">{members.filter(item=>item.userId).length}</span><span>com acesso</span>{canManage&&<><span className="settings-dot">·</span><span className="settings-stat">{invitations.filter(item=>item.status===1).length}</span><span>convite{invitations.filter(item=>item.status===1).length===1?'':'s'} pendente{invitations.filter(item=>item.status===1).length===1?'':'s'}</span></>}</div>{canManage&&<div className="members-toolbar-actions"><button className="secondary-button" onClick={()=>{setAddingMember(true);setEditingMember(undefined);setCreating(false);setError('');setSuccess('')}} disabled={addingMember}><Plus size={16}/> Adicionar elemento</button><button className="primary-button" onClick={()=>{setCreating(true);setAddingMember(false);setEditingMember(undefined);setError('');setSuccess('')}} disabled={creating}><Mail size={16}/> Convidar</button></div>}</div>
    {error&&<div className="form-error members-feedback">{error}</div>}{success&&<div className="form-success members-feedback"><Check size={15}/>{success}</div>}
    {addingMember&&<HouseholdMemberEditor relationships={relationships} roles={availableRoles} saving={memberSaving} onCancel={()=>setAddingMember(false)} onSave={createMember}/>}
    {editingMember&&<HouseholdMemberEditor member={editingMember} relationships={relationships} roles={availableRoles} saving={memberSaving} onCancel={()=>setEditingMember(undefined)} onSave={data=>updateMember({name:data.name,relationship:data.relationship,birthDate:data.birthDate,role:data.role})}/>}
    {creating&&<form className="member-add-card invitation-create-card" onSubmit={createInvitation}><div className="category-setting-title"><div><strong>Convidar para {household.name}</strong><small>A pessoa poderá criar uma conta ou entrar com uma conta existente.</small></div><button type="button" aria-label="Cancelar" onClick={()=>{setCreating(false);setError('')}}><X size={16}/></button></div><div className="member-add-form"><label>Email do convidado<input autoFocus required type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="nome@email.pt"/></label><label>Papel na família<select required value={role} onChange={event=>setRole(event.target.value)}>{availableRoles.map(item=><option key={item.value} value={item.value}>{roleLabel(item.name)}</option>)}</select></label><button className="primary-button" disabled={saving||!role}>{saving?<LoaderCircle className="spin"/>:<Mail/>}{saving?'A criar…':'Criar convite'}</button></div></form>}
    {sharing&&sharing.code&&sharing.invitationUrl&&<section className="invitation-share-card" aria-live="polite"><div className="invitation-share-head"><span><Mail/></span><div><small>CONVITE PRONTO A PARTILHAR</small><h3>{sharing.email}</h3><p>{roleLabel(roles.find(item=>item.value===sharing.role)?.name)} · válido até {formatDate(sharing.expiresAt)}</p></div><button type="button" aria-label="Fechar" onClick={()=>setSharing(undefined)}><X/></button></div><div className="invitation-secret"><div><small>Código do convite</small><strong>{sharing.code}</strong></div><button type="button" onClick={()=>copySecret('code',sharing.code)}><Copy/>{copied==='code'?'Copiado':'Copiar'}</button></div><div className="invitation-secret link"><div><small>Link de registo</small><span>{sharing.invitationUrl}</span></div><button type="button" onClick={()=>copySecret('link',sharing.invitationUrl)}><Link2/>{copied==='link'?'Copiado':'Copiar link'}</button></div><div className="invitation-share-actions"><p><ShieldCheck/> O código é pessoal e só pode ser usado pelo email convidado.</p><button type="button" className="primary-button" disabled={actionId===sharing.id||sharing.emailSent} onClick={()=>sendEmail(sharing)}>{actionId===sharing.id?<LoaderCircle className="spin"/>:<Mail/>}{sharing.emailSent?'Email enviado':'Enviar por email'}</button></div></section>}
    <section className="family-composition-grid" aria-label="Composição do agregado">{members.map(member=>{const memberRole=roles.find(item=>item.value===member.role);const relationship=relationships.find(item=>item.value===member.relationship);const ownMember=member.userId===user.id;const age=memberAge(member.birthDate);const incomplete=member.relationship==null||!member.birthDate;return <article className={`family-member-card ${member.userId?'with-account':'profile-only'} ${incomplete?'incomplete':''}`} key={member.id}><div className="family-member-top"><span className="family-member-avatar">{initials(member.name)}</span><div className="family-member-badges"><span className={member.userId?'account-badge':'profile-badge'}>{member.userId?<><ShieldCheck/> Conta Fings</>:<><UserRound/> Perfil familiar</>}</span>{ownMember&&<span className="member-you">Tu</span>}</div></div><div className="family-member-main"><h3>{member.name}</h3><p>{relationship?.name||'Grau familiar por preencher'}{member.birthDate&&age!==null?` · ${age} ${age===1?'ano':'anos'}`:''}</p></div>{incomplete&&<div className="family-member-warning"><TriangleAlert/> Completa o grau familiar e a data de nascimento.</div>}<div className="family-member-details"><div><small>Data de nascimento</small><strong>{member.birthDate?formatDate(member.birthDate):'Por preencher'}</strong></div><div><small>{member.userId?'Acesso':'Tipo'}</small><strong>{member.userId?roleLabel(memberRole?.name):'Sem acesso à app'}</strong></div>{member.userId&&<div className="wide"><small>Conta associada</small><strong>{member.email}</strong></div>}</div>{canManage&&(canEdit(member)||canRemove(member))&&<div className="family-member-actions">{canEdit(member)&&<button type="button" onClick={()=>{setEditingMember(member);setAddingMember(false);setCreating(false);setError('');setSuccess('')}}><Pencil/> Editar</button>}{canRemove(member)&&<button type="button" className="danger" onClick={()=>removeMember(member)} disabled={removingId===member.id}>{removingId===member.id?<LoaderCircle className="spin"/>:<Trash2/>} Remover</button>}</div>}</article>})}</section>
    {canManage&&invitations.length>0&&<section className="invitations-panel"><div className="invitations-panel-head"><div><strong>Convites</strong><small>Pendentes e histórico recente</small></div></div>{invitations.map(invitation=>{const status=invitation.status===1?'Pendente':invitation.status===2?'Aceite':invitation.status===3?'Expirado':'Revogado';return <article className="invitation-row" key={invitation.id}><span className="invitation-avatar"><Mail/></span><div className="invitation-identity"><strong>{invitation.email}</strong><small>{roleLabel(roles.find(item=>item.value===invitation.role)?.name)} · expira em {formatDate(invitation.expiresAt)}</small></div><span className={`invitation-status status-${invitation.status}`}>{status}</span>{invitation.status===1?<div className="invitation-actions"><button type="button" title="Enviar por email" aria-label={`Enviar convite para ${invitation.email}`} onClick={()=>sendEmail(invitation)} disabled={actionId===invitation.id}><Mail/></button><button type="button" title="Gerar novo código" aria-label={`Gerar novo código para ${invitation.email}`} onClick={()=>regenerate(invitation)} disabled={actionId===invitation.id}><RefreshCw/></button><button type="button" className="danger" title="Revogar" aria-label={`Revogar convite de ${invitation.email}`} onClick={()=>revoke(invitation)} disabled={actionId===invitation.id}><X/></button></div>:<span/>}</article>})}</section>}
  </div>
}

function SettingsPage({ user, categories, household, token, onUserUpdated, onCategoriesChanged, initialTab='profile' }: { user: User; categories:Category[]; household:Household; token: string; onUserUpdated: (user: User) => void; onCategoriesChanged:(categories:Category[])=>void; initialTab?:'profile'|'members'|'categories'|'notifications' }) {
  const [tab,setTab]=useState<'profile'|'members'|'categories'|'notifications'>(initialTab)
  const [editing,setEditing]=useState(false)
  const [form, setForm] = useState({ name: user.name, username: user.username })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  async function save(event: FormEvent) {
    event.preventDefault()
    const payload = { name: form.name.trim(), username: form.username.trim() }
    setError(''); setSuccess(false); setFieldErrors({})
    if (!payload.name || !payload.username) { setError('Preenche o nome e o username.'); return }
    setSaving(true)
    try {
      const updated = await api.updateProfile(payload, token)
      onUserUpdated(updated || { ...user, ...payload })
      setSuccess(true)
      setEditing(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        setFieldErrors(err.fields || {})
      } else setError('Não foi possível atualizar o perfil.')
    } finally { setSaving(false) }
  }

  return <><div className="page-heading"><div><p className="section-kicker">CONTA</p><h1>Definições</h1><p className="page-subtitle">Gere os teus dados, a família e a organização das despesas.</p></div></div><div className="settings-tabs" role="tablist"><button role="tab" aria-selected={tab==='profile'} className={tab==='profile'?'active':''} onClick={()=>setTab('profile')}><UserRound size={17}/> Dados do utilizador</button><button role="tab" aria-selected={tab==='members'} className={tab==='members'?'active':''} onClick={()=>setTab('members')}><UsersRound size={17}/> Família</button><button role="tab" aria-selected={tab==='categories'} className={tab==='categories'?'active':''} onClick={()=>setTab('categories')}><Tags size={17}/> Categorias</button><button role="tab" aria-selected={tab==='notifications'} className={tab==='notifications'?'active':''} onClick={()=>setTab('notifications')}><Bell size={17}/> Notificações</button></div>{tab==='profile'?<section className="panel settings-panel profile-settings-card"><div className="settings-profile-hero"><div className="settings-avatar large">{initials(user.name)}</div><div><h2>{user.name}</h2><p>@{user.username}</p></div>{!editing&&<button className="secondary-button" onClick={()=>{setEditing(true);setSuccess(false)}}><Pencil size={15}/> Editar dados</button>}</div>{editing?<form className="modal-form" onSubmit={save}><label>Nome<input autoFocus required maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Nome completo"/>{fieldErrors.name?.map(message => <small className="field-error" key={message}>{message}</small>)}</label><label>Username<input required maxLength={60} autoCapitalize="none" spellCheck={false} value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} placeholder="joao.silva"/>{fieldErrors.username?.map(message => <small className="field-error" key={message}>{message}</small>)}</label><div className="profile-email-note">O email <strong>{user.email}</strong> não é alterado nesta área.</div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>{setEditing(false);setForm({name:user.name,username:user.username});setError('');setFieldErrors({})}}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Check/>} {saving?'A guardar…':'Guardar alterações'}</button></div></form>:<div className="settings-readonly-grid"><div><small>Nome completo</small><strong>{user.name}</strong></div><div><small>Username</small><strong>@{user.username}</strong></div><div><small>Email</small><strong>{user.email}</strong></div></div>}{success&&!editing&&<div className="form-success settings-success"><Check size={15}/> Dados atualizados com sucesso.</div>}</section>:tab==='members'?<HouseholdMembersSettings user={user} household={household} token={token}/>:tab==='categories'?<CategorySettings categories={categories} householdId={household.id} token={token} onChanged={onCategoriesChanged}/>:<NotificationSettings householdId={household.id} token={token}/>}</>
}

function HelpPage({navigate,openModal,openNotificationSettings}:{navigate:(view:View)=>void;openModal:(modal:Modal)=>void;openNotificationSettings:()=>void}) {
  const guides=[
    {icon:ReceiptText,title:'Registar uma despesa',text:'Introduz o valor e escolhe uma despesa frequente para preencher rapidamente os restantes dados.',action:'Nova despesa',onClick:()=>openModal('expense')},
    {icon:Camera,title:'Digitalizar um talão',text:'Fotografa o talão, confirma os dados extraídos e revê as categorias antes de guardar.',action:'Digitalizar talão',onClick:()=>openModal('receipt')},
    {icon:Repeat2,title:'Automatizar pagamentos',text:'Cria uma recorrência para compromissos regulares e acompanha as próximas ocorrências.',action:'Ver recorrentes',onClick:()=>navigate('recurring')},
    {icon:Bell,title:'Ativar notificações',text:'Recebe alertas de despesas e orçamento dentro da Fings e no teu dispositivo.',action:'Gerir notificações',onClick:openNotificationSettings},
  ]
  const questions=[
    ['Como organizo melhor as despesas?','Usa categorias para a área principal e subcategorias para o detalhe. Podes geri-las em Definições e alterá-las ao registar ou rever uma despesa.'],
    ['Qual é a diferença entre movimentos e recorrentes?','Movimentos são despesas já registadas. Recorrentes são regras que ajudam a criar despesas que se repetem semanal, mensal, trimestral ou anualmente.'],
    ['Posso corrigir os dados de um talão?','Sim. Depois da análise, usa Rever para confirmar o comerciante, a data, os valores e a classificação de cada parcela.'],
    ['Como reutilizo despesas de outro mês?','Em Movimentos, escolhe Importar anteriores. Seleciona o mês de origem e as despesas pretendidas; serão copiadas para o mês que estás a consultar.'],
    ['Como funciona a partilha com a família?','Em Definições › Família, os membros autorizados podem criar convites e atribuir o papel adequado a cada pessoa.'],
    ['Como ativo notificações no iPhone ou iPad?','Abre a Fings no Safari, usa Partilhar › Adicionar ao ecrã principal e inicia a app pelo novo ícone. Depois, em Definições › Notificações, toca em Ativar neste dispositivo.'],
    ['Como ativo notificações no Android?','Em Definições › Notificações, toca em Ativar neste dispositivo e aceita a permissão do browser. Se as bloqueaste anteriormente, reativa-as nas definições do site ou do dispositivo.'],
    ['Qual é a diferença entre notificações na app e push?','As notificações na app aparecem no sino da Fings quando abres a aplicação. As notificações push aparecem no sistema do iPhone, iPad ou Android, mesmo quando a Fings está fechada, e exigem autorização do dispositivo.'],
    ['Quando recebo um alerta do orçamento?','A Fings avisa quando o orçamento mensal atinge 50%, 80% e 100%. Cada alerta é enviado apenas quando o respetivo limite é atravessado.'],
  ]
  return <div className="help-page"><div className="page-heading"><div><p className="section-kicker">CENTRO DE AJUDA</p><h1>Como podemos ajudar?</h1><p className="page-subtitle">Orientação simples para manter as finanças da tua casa organizadas.</p></div></div><section className="help-hero"><div><span><ShieldCheck size={18}/></span><div><small>COMEÇAR COM CONFIANÇA</small><h2>Uma visão clara começa com bons registos.</h2><p>Regista os movimentos, confirma as categorias e consulta a visão geral para acompanhar o mês.</p></div></div><button type="button" onClick={()=>navigate('overview')}>Ir para a visão geral <ArrowRight size={15}/></button></section><section className="help-section"><div className="help-section-heading"><div><small>PRIMEIROS PASSOS</small><h2>O essencial, sem complicações</h2></div><span>4 ações rápidas</span></div><div className="help-guide-grid">{guides.map(({icon:Icon,title,text,action,onClick})=><article className="help-guide-card" key={title}><span><Icon/></span><h3>{title}</h3><p>{text}</p><button type="button" onClick={onClick}>{action}<ArrowRight size={14}/></button></article>)}</div></section><div className="help-lower-grid"><section className="help-section help-faq"><div className="help-section-heading"><div><small>DÚVIDAS FREQUENTES</small><h2>Respostas rápidas</h2></div></div><div>{questions.map(([question,answer])=><details key={question}><summary>{question}<ChevronDown size={16}/></summary><p>{answer}</p></details>)}</div></section><aside className="help-side-card"><span><WalletCards/></span><small>BOA PRÁTICA</small><h3>Revê o teu mês regularmente</h3><p>Confirma movimentos e categorias antes de analisar o orçamento. Dados consistentes tornam a visão financeira mais útil.</p><button type="button" onClick={()=>navigate('expenses')}>Ver movimentos <ArrowRight size={14}/></button><div><ShieldCheck size={14}/><span>A Fings mostra apenas os dados do agregado selecionado.</span></div></aside></div></div>
}

function PeriodSelect({ label, value, onChange, max }: { label: string; value: string; onChange: (value: string) => void; max?:string }) {
  const [year, month] = value.split('-')
  const [maxYear,maxMonth]=max?.split('-')||[]
  const years=maxYear?periodYears.filter(option=>option<=maxYear):periodYears
  const months=maxYear&&year===maxYear?periodMonths.filter(option=>option<=maxMonth):periodMonths
  return <fieldset className="period-select"><legend>{label}</legend><div><select aria-label={`${label}: ano`} value={year} onChange={event => {const nextYear=event.target.value;const nextMonth=maxYear&&nextYear===maxYear&&month>maxMonth?maxMonth:month;onChange(`${nextYear}-${nextMonth}`)}}>{years.map(option => <option key={option} value={option}>{option}</option>)}</select><select aria-label={`${label}: mês`} value={month} onChange={event => onChange(`${year}-${event.target.value}`)}>{months.map(option => <option key={option} value={option}>{option}</option>)}</select></div></fieldset>
}

function BudgetModal({ householdId, token, onClose, onCreated }: {householdId:string;token:string;onClose:()=>void;onCreated:(b:Budget)=>void}) {const [form,setForm]=useState({name:'',startMonth:initialMonth,endMonth:initialMonth,monthlyAmount:''});const [saving,setSaving]=useState(false);const [error,setError]=useState('');async function save(e:FormEvent){e.preventDefault();setError('');if(form.startMonth>form.endMonth){setError('O mês final deve ser igual ou posterior ao mês inicial.');return}setSaving(true);try{const payload={name:form.name,startMonth:`${form.startMonth}-01`,endMonth:`${form.endMonth}-01`,monthlyAmount:Number(form.monthlyAmount),allocations:[]};const created=await api.createBudget(householdId,payload,token);onCreated(created);onClose()}catch(err){setError(err instanceof ApiError?err.message:'Não foi possível criar o orçamento.')}finally{setSaving(false)}}return <ModalShell onClose={onClose} title="Novo orçamento" subtitle="Planeia um valor mensal para um período."><form className="modal-form" onSubmit={save}><label>Nome do orçamento<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Primeiro semestre"/></label><div className="input-pair"><PeriodSelect label="Mês inicial" value={form.startMonth} onChange={startMonth=>setForm({...form,startMonth})}/><PeriodSelect label="Mês final" value={form.endMonth} onChange={endMonth=>setForm({...form,endMonth})}/></div><label className="amount-label">Valor mensal<div className="amount-input small"><span>€</span><input required inputMode="decimal" value={form.monthlyAmount} onChange={e=>setForm({...form,monthlyAmount:e.target.value})} placeholder="0,00"/></div></label><div className="info-box"><Sparkles/><span>A Fings irá criar uma receita planeada para cada mês deste período.</span></div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Check/>} Criar orçamento</button></div></form></ModalShell>}

function App() {
  const [token,setToken]=useState(()=>{
    const persistedToken=localStorage.getItem('fings_token')
    const sessionToken=sessionStorage.getItem('fings_token')
    if(!persistedToken&&sessionToken)localStorage.setItem('fings_token',sessionToken)
    if(sessionToken)sessionStorage.removeItem('fings_token')
    return persistedToken||sessionToken||''
  })
  const [view,setView]=useState<View>(viewFromLocation);const [modal,setModal]=useState<Modal>(null);const [mobileOpen,setMobileOpen]=useState(false)
  const [user,setUser]=useState<User>()
  const [period,setPeriod]=useState(initialPeriod)
  const [movementPeriod,setMovementPeriod]=useState(initialPeriod)
  const [households,setHouseholds]=useState<Household[]>([]);const [household,setHousehold]=useState<Household>();const [categories,setCategories]=useState<Category[]>([]);const [expenses,setExpenses]=useState<Expense[]>([]);const [dashboard,setDashboard]=useState<Dashboard>();const [budgets,setBudgets]=useState<Budget[]>([]);const [recurring,setRecurring]=useState<RecurringExpense[]>([]);const [loading,setLoading]=useState(false);const [loadError,setLoadError]=useState('')
  const [movementExpenses,setMovementExpenses]=useState<Expense[]>([]);const [movementLoading,setMovementLoading]=useState(false)
  const [editingExpense,setEditingExpense]=useState<Expense|null>(null);const [dataRevision,setDataRevision]=useState(0);const [overviewRefreshing,setOverviewRefreshing]=useState(false)
  const [movementCategoryId,setMovementCategoryId]=useState<string>()
  const [creatingRecurring,setCreatingRecurring]=useState(false)
  const [editingRecurring,setEditingRecurring]=useState<RecurringExpense|null>(null)
  const [settingsInitialTab,setSettingsInitialTab]=useState<'profile'|'notifications'>('profile')
  const [notificationExpenseId,setNotificationExpenseId]=useState(()=>new URLSearchParams(window.location.search).get('expenseId')||undefined)
  const authenticated=!!token
  const householdId=household?.id||''
  const periodLabel=new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(new Date(period.year,period.month-1,1))
  const movementPeriodLabel=new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(new Date(movementPeriod.year,movementPeriod.month-1,1))

  useEffect(()=>{const clearSession=()=>{localStorage.removeItem('fings_token');sessionStorage.removeItem('fings_token');setToken('');setUser(undefined);setHousehold(undefined);setDashboard(undefined)};window.addEventListener('fings:unauthorized',clearSession);return()=>window.removeEventListener('fings:unauthorized',clearSession)},[])
  useEffect(()=>{if(!token)return;setLoading(true);setLoadError('');(async()=>{try{const [me,initialHouseholds]=await Promise.all([api.me(token),api.households(token)]);setUser(me);setHouseholds(initialHouseholds);setHousehold(initialHouseholds[0]);const pendingInvitation=invitationCodeFromUrl();if(pendingInvitation){try{await api.acceptHouseholdInvitation(pendingInvitation,token);const nextHouseholds=await api.households(token);setHouseholds(nextHouseholds);setHousehold(nextHouseholds.find(item=>!initialHouseholds.some(existing=>existing.id===item.id))||nextHouseholds[0]);clearInvitationFromUrl()}catch(error){setLoadError(error instanceof ApiError?error.message:'Não foi possível aceitar o convite.')}}}catch(e){setLoadError(e instanceof ApiError?e.message:'Não foi possível carregar a conta.')}finally{setLoading(false)}})()},[token])
  useEffect(()=>{if(!token||!household)return;setLoading(true);setLoadError('');setDashboard(undefined);const month=String(period.month).padStart(2,'0');const from=`${period.year}-${month}-01`;const to=`${period.year}-${month}-${String(new Date(period.year,period.month,0).getDate()).padStart(2,'0')}`;Promise.all([api.categories(household.id,token),api.expenses(household.id,from,to,token),api.dashboard(household.id,period.year,period.month,token),api.budgets(household.id,token),api.recurringExpenses(household.id,token)]).then(([c,e,d,b,r])=>{setCategories(c);setExpenses(e);setDashboard(d);setBudgets(b);setRecurring(r)}).catch(e=>{setExpenses([]);setLoadError(e instanceof ApiError?e.message:'Não foi possível carregar os dados.')}).finally(()=>setLoading(false))},[household,token,period,dataRevision])
  useEffect(()=>{if(!token||!household||view!=='expenses')return;setMovementLoading(true);const month=String(movementPeriod.month).padStart(2,'0');const from=`${movementPeriod.year}-${month}-01`;const to=`${movementPeriod.year}-${month}-${String(new Date(movementPeriod.year,movementPeriod.month,0).getDate()).padStart(2,'0')}`;api.expenses(household.id,from,to,token).then(setMovementExpenses).catch(e=>{setMovementExpenses([]);setLoadError(e instanceof ApiError?e.message:'Não foi possível carregar os movimentos.')}).finally(()=>setMovementLoading(false))},[household,token,view,movementPeriod,dataRevision])
  const title=useMemo(()=>({overview:'Visão geral',expenses:'Movimentos',budgets:'Orçamentos',recurring:'Recorrentes',help:'Ajuda',settings:'Definições'})[view],[view]);useEffect(()=>{document.title=`${title} — Fings`},[title])
  function login(t:string){localStorage.setItem('fings_token',t);sessionStorage.removeItem('fings_token');setToken(t)}
  async function logout(){try{await removeCurrentPushSubscription(token)}finally{localStorage.removeItem('fings_token');sessionStorage.removeItem('fings_token');setToken('');setUser(undefined);setHousehold(undefined);setDashboard(undefined);setView('overview')}}
  function changePeriod(offset:number){setPeriod(current=>{const date=new Date(current.year,current.month-1+offset,1);return {year:date.getFullYear(),month:date.getMonth()+1}})}
  function changeMovementPeriod(offset:number){setMovementCategoryId(undefined);setMovementPeriod(current=>{const date=new Date(current.year,current.month-1+offset,1);return {year:date.getFullYear(),month:date.getMonth()+1}})}
  function openCategoryMovements(categoryId:string){setMovementPeriod(period);setMovementCategoryId(categoryId);setView('expenses')}
  function openNotificationSettings(){setSettingsInitialTab('notifications');setView('settings')}
  function openNotificationAction(actionUrl?:string|null,notificationHouseholdId?:string|null){
    if(notificationHouseholdId){const target=households.find(item=>item.id===notificationHouseholdId);if(target)setHousehold(target)}
    if(!actionUrl)return
    try{
      const url=new URL(actionUrl,window.location.origin)
      const requested=url.searchParams.get('view')
      setNotificationExpenseId(url.searchParams.get('expenseId')||undefined)
      const nextView:View|undefined=requested==='expenses'?'expenses':requested==='budget'||requested==='budgets'?'budgets':requested==='recurring'?'recurring':requested==='settings'?'settings':requested==='help'?'help':requested==='overview'?'overview':undefined
      if(nextView)setView(nextView)
      window.history.replaceState({},'',url.pathname)
    }catch{setView('overview')}
  }
  async function refreshOverview(){
    if(!token||!household||overviewRefreshing)return
    setOverviewRefreshing(true);setLoadError('')
    const month=String(period.month).padStart(2,'0');const from=`${period.year}-${month}-01`;const to=`${period.year}-${month}-${String(new Date(period.year,period.month,0).getDate()).padStart(2,'0')}`
    try{const [c,e,d,b,r]=await Promise.all([api.categories(household.id,token),api.expenses(household.id,from,to,token),api.dashboard(household.id,period.year,period.month,token),api.budgets(household.id,token),api.recurringExpenses(household.id,token)]);setCategories(c);setExpenses(e);setDashboard(d);setBudgets(b);setRecurring(r)}
    catch(error){setLoadError(error instanceof ApiError?error.message:'Não foi possível atualizar a visão geral.')}
    finally{setOverviewRefreshing(false)}
  }
  if(!authenticated)return <Auth onAuthenticated={login}/>
  if(!user)return <div className="page-loader"><LoaderCircle className="spin"/><span>A carregar os dados da conta…</span></div>
  return <div className="app-shell">
    <Sidebar view={view} setView={setView} mobileOpen={mobileOpen} close={()=>setMobileOpen(false)} onLogout={logout}/>
    <div className="app-main">
      <Topbar user={user} household={household} households={households} setHousehold={setHousehold} onMenu={()=>setMobileOpen(true)} onLogout={logout} token={token} onNotificationNavigate={openNotificationAction} onNotificationSettings={openNotificationSettings}/>
      <main className="content">
        {loadError&&<div className="page-error">{loadError}</div>}
        {loading?<div className="page-loader"><LoaderCircle className="spin"/><span>A organizar as tuas finanças…</span></div>:<>
          {view==='overview'&&<Overview dashboard={dashboard} expenses={expenses} categories={categories} user={user} periodLabel={periodLabel} changePeriod={changePeriod} openModal={setModal} setView={setView} refreshing={overviewRefreshing} onRefresh={refreshOverview} onCategorySelect={openCategoryMovements}/>}
          {view==='expenses'&&<ExpensesPage
            expenses={movementExpenses}
            categories={categories}
            periodLabel={movementPeriodLabel}
            loading={movementLoading}
            changePeriod={changeMovementPeriod}
            openModal={setModal}
            onEdit={setEditingExpense}
            onDelete={async expense=>{
              await api.deleteExpense(householdId,expense.id,token)
              setMovementExpenses(current=>current.filter(item=>item.id!==expense.id))
              setExpenses(current=>current.filter(item=>item.id!==expense.id))
              setDataRevision(current=>current+1)
            }}
            selectedCategoryId={movementCategoryId}
            onCategoryChange={setMovementCategoryId}
            focusExpenseId={notificationExpenseId}
          />}
          {view==='budgets'&&<BudgetsPage dashboard={dashboard} budgets={budgets} openModal={setModal}/>} 
          {view==='recurring'&&<RecurringPage items={recurring} categories={categories} onCreate={()=>setCreatingRecurring(true)} onEdit={setEditingRecurring} onMaterialize={async item=>{const result=await api.materializeRecurringExpense(householdId,item.id,token);setRecurring(current=>current.map(existing=>existing.id===item.id?{...existing,nextOccurrenceDate:result.nextOccurrenceDate,isActive:result.isActive}:existing));setDataRevision(current=>current+1);return result}}/>}
          {view==='help'&&<HelpPage navigate={setView} openModal={setModal} openNotificationSettings={openNotificationSettings}/>}
          {view==='settings'&&household&&<SettingsPage key={`${household.id}-${settingsInitialTab}`} user={user} categories={categories} household={household} token={token} onUserUpdated={setUser} onCategoriesChanged={setCategories} initialTab={settingsInitialTab}/>}
        </>}
      </main>
      <PoweredBy className="app-powered" />
    </div>
    {modal==='expense'&&<ExpenseModal categories={categories} householdId={householdId} token={token} onClose={()=>setModal(null)} onSaved={()=>setDataRevision(current=>current+1)}/>} 
    {modal==='import'&&<ImportExpensesModal categories={categories} householdId={householdId} token={token} destination={movementPeriod} onClose={()=>setModal(null)} onImported={()=>setDataRevision(current=>current+1)}/>}
    {editingExpense&&<ExpenseModal item={editingExpense} categories={categories} householdId={householdId} token={token} onClose={()=>setEditingExpense(null)} onSaved={()=>setDataRevision(current=>current+1)}/>} 
    {modal==='receipt'&&<ReceiptModal householdId={householdId} token={token} categories={categories} onClose={()=>setModal(null)} onCreated={()=>setDataRevision(current=>current+1)}/>} 
    {modal==='budget'&&<BudgetModal householdId={householdId} token={token} onClose={()=>setModal(null)} onCreated={b=>setBudgets([b,...budgets])}/>} 
    {creatingRecurring&&<RecurringExpenseModal categories={categories} householdId={householdId} token={token} onClose={()=>setCreatingRecurring(false)} onSaved={created=>{setRecurring(current=>[created,...current]);void refreshOverview()}}/>}
    {editingRecurring&&<RecurringExpenseModal item={editingRecurring} categories={categories} householdId={householdId} token={token} onClose={()=>setEditingRecurring(null)} onSaved={updated=>{setRecurring(current=>current.map(item=>item.id===updated.id?updated:item));void refreshOverview()}}/>}
  </div>
}

export default App
