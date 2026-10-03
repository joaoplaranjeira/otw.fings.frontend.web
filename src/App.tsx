import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CalendarDays, Camera, Check,
  ChevronDown, ChevronRight, CircleHelp, CreditCard, FileText, Grid2X2, Home, Landmark,
  LayoutDashboard, LoaderCircle, LogOut, Menu, MoreHorizontal, Plus, ReceiptText,
  Pencil, Play, Repeat2, Search, Settings, ShieldCheck, ShoppingBasket, Sparkles, Tags, Trash2, TrendingDown, TrendingUp,
  TriangleAlert, Upload, UserRound, Utensils, WalletCards, X,
} from 'lucide-react'
import { api, ApiError, type Budget, type Category, type Dashboard, type Expense, type ExpensePayloadLine, type Household, type ReceiptParseLine, type ReceiptParseResult, type RecurringExpense, type RecurringExpenseMaterialization, type User } from './api'

type View = 'overview' | 'expenses' | 'budgets' | 'recurring' | 'settings'
type Modal = 'expense' | 'receipt' | 'budget' | null

const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const compactEuro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const periodYears = Array.from({ length: 75 }, (_, index) => String(2025 + index))
const periodMonths = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const today=new Date()
const initialPeriod={year:today.getFullYear(),month:today.getMonth()+1}
const initialMonth=`${initialPeriod.year}-${String(initialPeriod.month).padStart(2,'0')}`
const todayIso=`${initialPeriod.year}-${String(initialPeriod.month).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

function formatDate(value?: string | null) {
  const match=value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match?`${match[3]}/${match[2]}/${match[1]}`:''
}

function parseDate(value:string) {
  const match=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if(!match)return ''
  const [,day,month,year]=match;const iso=`${year}-${month}-${day}`;const parsed=new Date(`${iso}T12:00:00`)
  return parsed.getFullYear()===Number(year)&&parsed.getMonth()+1===Number(month)&&parsed.getDate()===Number(day)?iso:''
}

function DateInput({value,onChange,required=false,min}:{value:string;onChange:(value:string)=>void;required?:boolean;min?:string}) {
  const [display,setDisplay]=useState(formatDate(value))
  useEffect(()=>setDisplay(formatDate(value)),[value])
  return <input className="date-input" type="text" inputMode="numeric" autoComplete="off" placeholder="DD/MM/AAAA" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" required={required} value={display} onChange={event=>{const digits=event.target.value.replace(/\D/g,'').slice(0,8);const next=[digits.slice(0,2),digits.slice(2,4),digits.slice(4,8)].filter(Boolean).join('/');const iso=parseDate(next);setDisplay(next);if(!next)onChange('');else if(iso&&(!min||iso>=min))onChange(iso);event.currentTarget.setCustomValidity(next.length===10&&!iso?'Indica uma data válida no formato DD/MM/AAAA.':iso&&min&&iso<min?'A data não pode ser anterior à data inicial.':'')}} onBlur={event=>{const iso=parseDate(display);event.currentTarget.setCustomValidity(display&&(!iso||!!min&&iso<min)?!iso?'Indica uma data válida no formato DD/MM/AAAA.':'A data não pode ser anterior à data inicial.':'')}}/>
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

function Logo({ light = false }: { light?: boolean }) {
  return <div className={`logo ${light ? 'logo-light' : ''}`}><span className="logo-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M8.5 21.5v-5.2M16 21.5V12M23.5 21.5V7.8"/></svg></span><span className="logo-word">fings</span></div>
}

function PoweredBy({ className = '' }: { className?: string }) {
  return <footer className={`powered-by ${className}`.trim()}>powered by <a href="https://www.othub.pt" target="_blank" rel="noreferrer" aria-label="OTW, Lda. — www.othub.pt">OTW, Lda.</a></footer>
}

function Auth({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', username: '', householdName: '' })

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (mode === 'register') {
        await api.register({ ...form, email })
        await api.sendOtp(email)
        setMode('login'); setStep('code')
      } else if (step === 'email') {
        await api.sendOtp(email); setStep('code')
      } else {
        const result = await api.validateOtp(email, code)
        onAuthenticated(result.token)
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível ligar ao servidor.')
    } finally { setLoading(false) }
  }

  return <main className="auth-shell">
    <section className="auth-brand-panel">
      <Logo light />
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
        <span className="auth-kicker">{mode === 'register' ? 'COMEÇA AGORA' : step === 'email' ? 'BEM-VINDO DE VOLTA' : 'VERIFICA O TEU EMAIL'}</span>
        <h2>{mode === 'register' ? 'Cria a tua conta' : step === 'email' ? 'Entra na Fings' : 'Introduz o código'}</h2>
        <p className="auth-sub">{step === 'code' ? <>Enviámos um código de 6 dígitos para <strong>{email}</strong>.</> : mode === 'register' ? 'A tua casa financeira, pronta em menos de um minuto.' : 'Usamos um código seguro — não precisas de palavra-passe.'}</p>
        <form onSubmit={submit}>
          {mode === 'register' && <>
            <label>Nome completo<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="João Santos" /></label>
            <div className="input-pair"><label>Username<input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="joao.santos" /></label><label>Nome do agregado<input required value={form.householdName} onChange={e => setForm({ ...form, householdName: e.target.value })} placeholder="Família Santos" /></label></div>
          </>}
          {step === 'email' ? <label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@email.pt" /></label> : <label>Código de acesso<input className="otp-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="• • • • • •" /></label>}
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button full" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : step === 'code' ? 'Confirmar e entrar' : mode === 'register' ? 'Criar conta' : 'Receber código'}{!loading && <ArrowRight size={17} />}</button>
        </form>
        {step === 'email' && <>
          <p className="auth-switch">{mode === 'login' ? 'Ainda não tens conta?' : 'Já tens conta?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Criar conta' : 'Entrar'}</button></p>
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
    <div className="sidebar-bottom"><button><CircleHelp size={19} /> Ajuda</button><button className={view === 'settings' ? 'active' : ''} onClick={() => { setView('settings'); close() }}><Settings size={19} /> Definições</button><button onClick={onLogout}><LogOut size={19} /> Terminar sessão</button></div>
  </aside>{mobileOpen && <button aria-label="Fechar menu" className="scrim" onClick={close} />}</>
}

function Topbar({ user, household, households, setHousehold, onMenu, onLogout }: { user: User; household?: Household; households: Household[]; setHousehold: (h: Household) => void; onMenu: () => void; onLogout?: () => void }) {
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
      <button className="icon-button"><Bell size={19} /></button>
      <span className="top-divider" />
      <div className="profile-wrap" ref={profileRef}>
        <button className="profile-button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen(open => !open)}><span>{initials(user.name)}</span><div><strong>{shortName(user.name)}</strong><small>@{user.username}</small></div><ChevronDown className={profileOpen ? 'open' : ''} size={15} /></button>
        {profileOpen && <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-head"><strong>{user.name}</strong><small>{user.email}</small></div>
          <div className="profile-dropdown-label">Alterar conta</div>
          {households.map(item => <button key={item.id} role="menuitemradio" aria-checked={item.id === household?.id} onClick={() => { setHousehold(item); setProfileOpen(false) }}><span className="profile-option-avatar">{item.name.slice(0, 2).toUpperCase()}</span><span><strong>{item.name}</strong><small>{item.role === 1 ? 'Owner' : 'Membro'}</small></span>{item.id === household?.id && <Check size={16} />}</button>)}
          <button className="profile-logout" role="menuitem" onClick={() => onLogout ? onLogout() : window.dispatchEvent(new Event('fings:unauthorized'))}><LogOut size={16} /> Terminar sessão</button>
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

function Overview({ dashboard, expenses, categories, user, periodLabel, changePeriod, openModal, setView }: { dashboard?: Dashboard; expenses: Expense[]; categories: Category[]; user:User; periodLabel:string; changePeriod:(offset:number)=>void; openModal: (m: Modal) => void; setView: (v: View) => void }) {
  const pct = dashboard?.budget ? Math.min(100, dashboard.confirmedExpenses / dashboard.budget * 100) : null
  const savingRate=dashboard?.plannedIncome ? (dashboard.plannedIncome-dashboard.confirmedExpenses)/dashboard.plannedIncome*100 : null
  const dashboardCategories=dashboard?.categories||[]
  const maxBar = Math.max(...dashboardCategories.map(c => c.spent), 1)
  return <>
    <div className="page-heading"><div><p className="greeting">Olá, {user.name.trim().split(/\s+/)[0]} <span>👋</span></p><h1>Vamos cuidar das tuas finanças.</h1></div><div className="heading-actions"><button className="secondary-button" onClick={() => openModal('receipt')}><Camera size={17} /> Digitalizar talão</button><button className="primary-button" onClick={() => openModal('expense')}><Plus size={17} /> Nova despesa</button></div></div>
    <div className="overview-period"><MonthNavigator label={periodLabel} onChange={changePeriod}/></div>
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
        {dashboardCategories.length?<div className="bar-chart">{dashboardCategories.slice(0, 5).map((c, i) => { const cat = categories.find(x => x.id === c.categoryId); return <div className="bar-column" key={c.categoryId}><div className="bar-value">{compactEuro.format(c.spent)}</div><div className="bar-track"><div style={{ height: `${Math.max(12, c.spent / maxBar * 100)}%`, background: cat?.color || ['#6d5dfc','#ff9f43','#2ec4b6','#ff5c8a'][i] }} /></div><span>{c.categoryName}</span></div>})}</div>:<DataUnavailable message="Ainda não existem despesas categorizadas neste período."/>}
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

function ExpenseLinesPanel({expense,categories,onEdit}:{expense:Expense;categories:Category[];onEdit:(expense:Expense)=>void}) {
  const distribution=expense.lines.reduce<{id:string;name:string;amount:number;color:string}[]>((items,line)=>{const existing=items.find(item=>item.id===line.categoryId);if(existing)existing.amount+=line.amount;else items.push({id:line.categoryId,name:line.categoryName,amount:line.amount,color:categories.find(category=>category.id===line.categoryId)?.color||'#6d5dfc'});return items},[])
  const origin=expense.origin===1?'Registo manual':expense.origin===2?'Despesa recorrente':'Talão digitalizado'
  return <section className="expense-detail"><header className="expense-detail-hero"><div className="expense-detail-identity"><span><ReceiptText size={20}/></span><div><small>DETALHE DO MOVIMENTO</small><h3>{expense.merchantName||expense.description}</h3><p>{formatDate(expense.date)} · {origin}</p></div></div><div className="expense-detail-actions"><button type="button" onClick={()=>onEdit(expense)}><Pencil size={14}/> Editar despesa</button><div className="expense-detail-total"><small>VALOR TOTAL</small><strong>{euro.format(expense.amount)}</strong><span><Check size={12}/> {expense.lines.length} parcela{expense.lines.length===1?'':'s'} conciliada{expense.lines.length===1?'':'s'}</span></div></div></header><div className="expense-detail-body"><section className="expense-distribution"><div className="expense-detail-section-title"><div><span>Distribuição</span><strong>Onde foi aplicado o valor</strong></div><small>{distribution.length} categoria{distribution.length===1?'':'s'}</small></div><div className="expense-distribution-bar" aria-label="Distribuição do valor por categoria">{distribution.map(item=><i key={item.id} title={`${item.name}: ${euro.format(item.amount)}`} style={{width:`${item.amount/expense.amount*100}%`,background:item.color}}/>)}</div><div className="expense-distribution-legend">{distribution.map(item=><div key={item.id}><i style={{background:item.color}}/><span>{item.name}</span><strong>{euro.format(item.amount)}</strong><small>{Math.round(item.amount/expense.amount*100)}%</small></div>)}</div></section><section className="expense-installments"><div className="expense-detail-section-title"><div><span>Parcelas</span><strong>Composição da despesa</strong></div><small>{expense.lines.length} item{expense.lines.length===1?'':'s'}</small></div><div className="expense-installment-list">{expense.lines.map((line,index)=>{const color=categories.find(category=>category.id===line.categoryId)?.color||'#6d5dfc';return <article className="expense-installment" key={line.id}><span className="expense-installment-index">{String(index+1).padStart(2,'0')}</span><div className="expense-installment-main"><strong>{line.description}</strong><span><i style={{background:color}}/>{line.categoryName}{line.subcategoryName&&<em>{line.subcategoryName}</em>}</span></div><div className="expense-installment-math">{line.quantity!=null&&<small>QTD. {line.quantity}</small>}{line.unitPrice!=null&&<span>{line.quantity!=null?'× ':''}{euro.format(line.unitPrice)}</span>}{line.quantity==null&&line.unitPrice==null&&<small>VALOR DIRETO</small>}</div><strong className="expense-installment-amount">{euro.format(line.amount)}</strong></article>})}</div></section></div></section>
}

function ExpensesPage({ expenses, categories, periodLabel, loading, changePeriod, openModal, onEdit }: { expenses: Expense[]; categories: Category[]; periodLabel:string; loading:boolean; changePeriod:(offset:number)=>void; openModal: (m: Modal) => void; onEdit:(expense:Expense)=>void }) {
  const [search, setSearch] = useState('')
  const [expandedExpenseId,setExpandedExpenseId]=useState<string>()
  const shown = expenses.filter(e => `${e.description} ${e.merchantName} ${e.categoryName} ${e.lines?.map(line=>`${line.description} ${line.categoryName} ${line.subcategoryName||''}`).join(' ')||''}`.toLowerCase().includes(search.toLowerCase()))
  return <><div className="page-heading"><div><p className="section-kicker">MOVIMENTOS</p><h1>Todas as despesas</h1><p className="page-subtitle">Acompanha cada euro, sem perder o fio à meada.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => openModal('receipt')}><Camera size={17} /> Digitalizar talão</button><button className="primary-button" onClick={() => openModal('expense')}><Plus size={17} /> Nova despesa</button></div></div><div className="panel data-panel"><div className="table-toolbar"><div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar movimentos" /></div><MonthNavigator label={periodLabel} onChange={changePeriod}/></div><div className="expense-table"><div className="table-row table-header"><span>Movimento</span><span>Data</span><span>Origem</span><span>Valor</span><span /></div>{loading?<div className="movement-loading"><LoaderCircle className="spin"/><span>A carregar movimentos de {periodLabel}…</span></div>:shown.length?shown.map(e => {const expanded=expandedExpenseId===e.id;return <Fragment key={e.id}><div className={`table-row ${expanded?'expanded':''}`}><span><Transaction expense={e} categories={categories}/></span><span>{formatDate(e.date)}</span><span><i className="origin-pill">{e.origin === 1 ? 'Manual' : e.origin === 2 ? 'Recorrente' : 'Talão'}</i></span><strong>− {euro.format(e.amount)}</strong><button className="expense-lines-toggle" aria-label={`${expanded?'Ocultar':'Ver'} parcelas de ${e.description}`} title={expanded?'Ocultar parcelas':'Ver parcelas'} aria-expanded={expanded} onClick={()=>setExpandedExpenseId(expanded?undefined:e.id)}>{expanded?<ChevronDown size={17}/>:<ChevronRight size={17}/>}</button></div>{expanded&&<ExpenseLinesPanel expense={e} categories={categories} onEdit={onEdit}/>}</Fragment>}):<DataUnavailable message={`Ainda não existem movimentos em ${periodLabel}.`}/>}</div></div></>
}

function BudgetsPage({ dashboard, budgets, openModal }: { dashboard?: Dashboard; budgets: Budget[]; openModal: (m: Modal) => void }) {
  const current=budgets.find(b=>b.status===1)||budgets[0];const monthly=current?.monthlyAmount??dashboard?.budget;const allocations=dashboard?.categories||[];const allocated=allocations.reduce((n,c)=>n+(c.budget||0),0)
  return <><div className="page-heading"><div><p className="section-kicker">PLANEAMENTO</p><h1>Orçamentos</h1><p className="page-subtitle">Define limites simples e dá intenção ao teu dinheiro.</p></div><button className="primary-button" onClick={() => openModal('budget')}><Plus size={17}/> Novo orçamento</button></div><div className="budget-overview-card"><div>{current&&<span className="status-pill"><i/> {current.status===2?'FECHADO':'ATIVO'}</span>}<h2>{current?.name||'Sem orçamento ativo'}</h2><p>{current ? `${new Date(current.startMonth+'T12:00:00').toLocaleDateString('pt-PT',{month:'long',year:'numeric'})} — ${new Date(current.endMonth+'T12:00:00').toLocaleDateString('pt-PT',{month:'long',year:'numeric'})}` : 'Ainda não existem dados de orçamento.'}</p></div><div className="budget-big-number"><small>POR MÊS</small><strong>{monthly===undefined?'Dados não obtidos':euro.format(monthly)}</strong></div></div><div className="panel allocation-panel"><div className="panel-head"><div><h3>Distribuição mensal</h3><p>{monthly===undefined?'Dados não obtidos':`${euro.format(allocated)} alocados de ${euro.format(monthly)}`}</p></div>{monthly!==undefined&&<span className="allocation-free">{euro.format(monthly-allocated)} livres</span>}</div>{allocations.length?<div className="allocation-list">{allocations.map((c,i) => <div key={c.categoryId}><span className="allocation-dot" style={{background: ['#6d5dfc','#ff9f43','#2ec4b6','#ff5c8a'][i%4]}}/><strong>{c.categoryName}</strong><div className="allocation-bar"><i style={{width: `${Math.min(100,(c.spent/(c.budget || 1))*100)}%`, background: ['#6d5dfc','#ff9f43','#2ec4b6','#ff5c8a'][i%4]}}/></div><span>{euro.format(c.spent)} <small>/ {c.budget===null?'Sem limite':euro.format(c.budget)}</small></span></div>)}</div>:<DataUnavailable message="Ainda não existem dados de distribuição para este orçamento."/>}</div></>
}

function RecurringPage({items,categories,onCreate,onEdit,onMaterialize}:{items:RecurringExpense[];categories:Category[];onCreate:()=>void;onEdit:(item:RecurringExpense)=>void;onMaterialize:(item:RecurringExpense)=>Promise<RecurringExpenseMaterialization>}) {
  const frequency=['','Semanal','Mensal','Trimestral','Anual']
  const [materializingId,setMaterializingId]=useState<string>()
  const [feedback,setFeedback]=useState<{kind:'success'|'error';message:string}>()
  async function materialize(item:RecurringExpense){setMaterializingId(item.id);setFeedback(undefined);try{const result=await onMaterialize(item);setFeedback({kind:'success',message:result.createdCount?`${result.createdCount} movimento${result.createdCount===1?' criado':'s criados'} com sucesso.`:'Não existem movimentos pendentes para criar.'})}catch(error){setFeedback({kind:'error',message:error instanceof ApiError?error.message:'Não foi possível gerar os movimentos pendentes.'})}finally{setMaterializingId(undefined)}}
  return <><div className="page-heading"><div><p className="section-kicker">AUTOMAÇÃO</p><h1>Despesas recorrentes</h1><p className="page-subtitle">Os compromissos regulares, sempre debaixo de olho.</p></div><button className="primary-button" onClick={onCreate}><Plus size={17}/> Nova recorrência</button></div><div className="recurring-summary"><div><Repeat2/><span><small>PREVISTO ESTE MÊS</small><strong>Dados insuficientes</strong></span></div><div><CalendarDays/><span><small>REGRAS ATIVAS</small><strong>{items.filter(item=>item.isActive).length} recorrências</strong></span></div></div>{feedback&&<div className={`recurring-feedback ${feedback.kind}`} role="status">{feedback.kind==='success'?<Check size={16}/>:<TriangleAlert size={16}/>}<span>{feedback.message}</span></div>}<div className="panel recurring-list">{items.length?items.map((item,i) => {const category=categories.find(c=>c.id===item.categoryId)?.name||'Sem categoria';const hasPending=item.isActive&&item.nextOccurrenceDate<=todayIso;return <div className="recurring-row" key={item.id}><span className="merchant-logo" style={{background:['#fff1de','#ffe8ef','#ddf7f2','#e7f2ff'][i%4]}}>{(item.merchantName||item.description).slice(0,1)}</span><div><strong>{item.merchantName||item.description}</strong><small>{item.description} · {category} · Próxima: {formatDate(item.nextOccurrenceDate)}</small></div><span className="schedule-pill"><Repeat2 size={13}/>{frequency[item.frequency]}</span><strong>{euro.format(item.amount)}</strong><div className="recurring-actions">{hasPending&&<button aria-label={`Gerar movimentos pendentes de ${item.description}`} title="Gerar movimentos pendentes" disabled={materializingId===item.id} onClick={()=>materialize(item)}>{materializingId===item.id?<LoaderCircle className="spin"/>:<Play/>}</button>}<button aria-label={`Editar ${item.description}`} title="Editar" onClick={()=>onEdit(item)}><MoreHorizontal/></button></div></div>}):<DataUnavailable message="Ainda não existem despesas recorrentes configuradas."/>}</div></>
}

function ModalShell({ children, onClose, title, subtitle }: { children: React.ReactNode; onClose: () => void; title: string; subtitle: string }) {
  return <div className="modal-layer"><button className="modal-scrim" onClick={onClose}/><div className="modal-card"><div className="modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button onClick={onClose}><X/></button></div>{children}</div></div>
}

type ExpenseLineDraft = { description:string; quantity:string; unitPrice:string; amount:string; categoryId:string; subcategoryId:string }

function ExpenseModal({ item, categories, householdId, token, onClose, onSaved }: { item?:Expense; categories: Category[]; householdId: string; token: string; onClose: () => void; onSaved: (expense:Expense) => void }) {
  const firstCategoryId=categories[0]?.id||''
  const defaultDate=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const [form,setForm]=useState({amount:item?String(item.amount):'',description:item?.description||'',date:item?.date||defaultDate,categoryId:item?.categoryId||firstCategoryId,subcategoryId:item?.subcategoryId||'',merchantName:item?.merchantName||'',merchantTaxNumber:item?.merchantTaxNumber||''})
  const [split,setSplit]=useState(!!item)
  const [lines,setLines]=useState<ExpenseLineDraft[]>(()=>item?.lines.map(line=>({description:line.description,quantity:line.quantity==null?'':String(line.quantity),unitPrice:line.unitPrice==null?'':String(line.unitPrice),amount:String(line.amount),categoryId:line.categoryId,subcategoryId:line.subcategoryId||''}))||[])
  const [saving,setSaving]=useState(false); const [error,setError]=useState('')
  const selected=categories.find(c=>c.id===form.categoryId)
  const parseAmount=(value:string)=>Number(value.replace(',','.'))
  const parseOptional=(value:string)=>value.trim()===''?null:parseAmount(value)
  const invalidOptional=(value:string)=>{const parsed=parseOptional(value);return parsed!==null&&(!Number.isFinite(parsed)||parsed<=0)}
  const linesTotal=lines.reduce((sum,line)=>sum+(parseAmount(line.amount)||0),0)
  function emptyLine():ExpenseLineDraft{return {description:'',quantity:'',unitPrice:'',amount:'',categoryId:firstCategoryId,subcategoryId:''}}
  function enableSplit(){setSplit(true);setLines([{description:form.description,quantity:'',unitPrice:'',amount:form.amount,categoryId:form.categoryId,subcategoryId:form.subcategoryId},emptyLine()])}
  function updateLine(index:number,changes:Partial<ExpenseLineDraft>){setLines(current=>current.map((line,itemIndex)=>itemIndex===index?{...line,...changes}:line))}
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
  return <ModalShell onClose={onClose} title={item?'Editar despesa':'Nova despesa'} subtitle={item?'Atualiza o movimento e as parcelas na mesma operação.':'Regista um movimento e, se precisares, divide-o por parcelas.'}><form className={`modal-form ${split?'expense-with-lines':''}`} onSubmit={save}><label className="amount-label">Valor total<div className="amount-input"><span>€</span><input autoFocus required inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0,00"/></div></label><div className="input-pair"><label>Descrição<input required maxLength={500} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Ex.: Compras da semana"/></label><label>Data<DateInput required value={form.date} onChange={date=>setForm({...form,date})}/></label></div>{!split&&<div className="input-pair"><label>Categoria<select required value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value,subcategoryId:''})}>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Subcategoria<select value={form.subcategoryId} onChange={e=>setForm({...form,subcategoryId:e.target.value})}><option value="">Sem subcategoria</option>{selected?.subcategories.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label></div>}<div className="input-pair"><label>Comerciante <small>opcional</small><input maxLength={250} value={form.merchantName} onChange={e=>setForm({...form,merchantName:e.target.value})} placeholder="Nome do comerciante"/></label><label>NIF <small>opcional</small><input maxLength={32} value={form.merchantTaxNumber} onChange={e=>setForm({...form,merchantTaxNumber:e.target.value})} placeholder="000 000 000"/></label></div>{split?<section className="expense-lines"><div className="expense-lines-heading"><div><strong>Parcelas da despesa</strong><small>Altera valores, quantidades e classificação.</small></div>{!item&&<button type="button" onClick={()=>{setSplit(false);setLines([])}}>Usar uma só categoria</button>}</div>{lines.map((line,index)=>{const category=categories.find(category=>category.id===line.categoryId);return <div className="expense-line" key={index}><label className="wide">Descrição<input required maxLength={500} value={line.description} onChange={event=>updateLine(index,{description:event.target.value})}/></label><label>Qtd. <small>opcional</small><input inputMode="decimal" value={line.quantity} onChange={event=>updateLine(index,{quantity:event.target.value})}/></label><label>Preço unit. <small>opcional</small><input inputMode="decimal" value={line.unitPrice} onChange={event=>updateLine(index,{unitPrice:event.target.value})}/></label><label>Valor<input required inputMode="decimal" value={line.amount} onChange={event=>updateLine(index,{amount:event.target.value})} placeholder="0,00"/></label><label>Categoria<select required value={line.categoryId} onChange={event=>updateLine(index,{categoryId:event.target.value,subcategoryId:''})}>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Subcategoria<select value={line.subcategoryId} onChange={event=>updateLine(index,{subcategoryId:event.target.value})}><option value="">Sem subcategoria</option>{category?.subcategories.map(subcategory=><option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</select></label><button type="button" aria-label={`Remover parcela ${index+1}`} disabled={lines.length<=(item?1:2)} onClick={()=>setLines(current=>current.filter((_,itemIndex)=>itemIndex!==index))}><Trash2 size={15}/></button></div>})}<div className="expense-lines-footer"><button type="button" onClick={()=>setLines(current=>[...current,emptyLine()])}><Plus size={13}/> Adicionar parcela</button><span className={Math.round(linesTotal*100)===Math.round((parseAmount(form.amount)||0)*100)?'matched':'different'}>Parcelas: <strong>{euro.format(linesTotal)}</strong> / {euro.format(parseAmount(form.amount)||0)}</span></div></section>:<button type="button" className="split-expense-button" onClick={enableSplit}><Plus size={15}/><span><strong>Dividir por parcelas</strong><small>Distribui o total por várias categorias.</small></span></button>}{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Check/>} {saving?'A guardar…':item?'Guardar alterações':'Registar despesa'}</button></div></form></ModalShell>
}

function ReceiptParsedLine({ line, categories }: { line:ReceiptParseLine; categories:Category[] }) {
  const category=categories.find(item=>item.id===line.suggestedCategoryId)
  const subcategory=category?.subcategories.find(item=>item.id===line.suggestedSubcategoryId)
  return <div className="result-line"><div className="result-line-main"><strong>{line.description}</strong><small className={line.confidence<.8?'low-confidence':''}>{Math.round(line.confidence*100)}% confiança</small><div className="ai-category"><Sparkles size={11}/><span>{category?.name||'Categoria não identificada'}</span><i>/</i><span>{subcategory?.name||'Sem subcategoria'}</span></div></div><strong className="result-line-amount">{euro.format(line.amount)}</strong></div>
}

function ReceiptLineEditor({ line, categories, onChange, onRemove }: { line:ReceiptParseLine; categories:Category[]; onChange:(line:ReceiptParseLine)=>void; onRemove:()=>void }) {
  const category=categories.find(item=>item.id===line.suggestedCategoryId)
  return <div className="receipt-line-editor"><div className="receipt-edit-grid"><label className="wide">Descrição<input required maxLength={500} value={line.description} onChange={event=>onChange({...line,description:event.target.value})}/></label><label>Quantidade<input type="number" min="0" step="0.01" value={line.quantity??''} onChange={event=>onChange({...line,quantity:event.target.value===''?null:Number(event.target.value)})}/></label><label>Preço unitário<input type="number" min="0" step="0.01" value={line.unitPrice??''} onChange={event=>onChange({...line,unitPrice:event.target.value===''?null:Number(event.target.value)})}/></label><label>Valor<input required type="number" min="0.01" step="0.01" value={line.amount} onChange={event=>onChange({...line,amount:Number(event.target.value)})}/></label><label>Categoria<select required value={line.suggestedCategoryId||''} onChange={event=>{const selected=categories.find(item=>item.id===event.target.value);onChange({...line,suggestedCategoryId:selected?.id||null,suggestedCategoryName:selected?.name||null,suggestedSubcategoryId:null,suggestedSubcategoryName:null})}}><option value="">Selecionar</option>{categories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Subcategoria<select value={line.suggestedSubcategoryId||''} disabled={!category} onChange={event=>{const selected=category?.subcategories.find(item=>item.id===event.target.value);onChange({...line,suggestedSubcategoryId:selected?.id||null,suggestedSubcategoryName:selected?.name||null})}}><option value="">Sem subcategoria</option>{category?.subcategories.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="receipt-line-footer"><span className={`receipt-confidence ${line.confidence<.8?'low':''}`}><Sparkles size={11}/>{Math.round(line.confidence*100)}% confiança da IA</span><button type="button" onClick={onRemove}><Trash2 size={13}/> Remover linha</button></div></div>
}

function ReceiptModal({ householdId, token, categories, onClose, onCreated }: { householdId:string; token:string; categories:Category[]; onClose:()=>void; onCreated:(item:Expense)=>void }) {
  const inputRef=useRef<HTMLInputElement>(null);const [file,setFile]=useState<File>();const [loading,setLoading]=useState(false);const [result,setResult]=useState<ReceiptParseResult>();const [original,setOriginal]=useState<ReceiptParseResult>();const [editing,setEditing]=useState(false);const [validationNotes,setValidationNotes]=useState('');const [error,setError]=useState('')
  async function parse(){if(!file)return;setLoading(true);setError('');try{const parsed=await api.parseReceipt(householdId,file,token);setResult(parsed);setOriginal(structuredClone(parsed))}catch(err){setError(err instanceof ApiError?err.message:'Não foi possível analisar o talão.')}finally{setLoading(false)}}
  function updateLine(index:number,line:ReceiptParseLine){if(!result)return;setResult({...result,lines:result.lines.map((item,itemIndex)=>itemIndex===index?line:item)})}
  async function confirm(){
    if(!result||!original)return
    setError('');setLoading(true)
    try{
      const changed=JSON.stringify(result)!==JSON.stringify(original)
      const notes=changed?[`O utilizador corrigiu o parse antes da confirmação.`,validationNotes.trim()].filter(Boolean).join(' '):(validationNotes.trim()||null)
      const lines:ExpensePayloadLine[]=result.lines.map(line=>({categoryId:line.suggestedCategoryId!,subcategoryId:line.suggestedSubcategoryId||null,description:line.description.trim(),quantity:line.quantity??null,unitPrice:line.unitPrice??null,amount:line.amount}))
      const created=await api.createExpense(householdId,{categoryId:null,subcategoryId:null,date:result.purchaseDate!,amount:result.total,description:result.documentNumber?`Talão ${result.documentNumber}`:result.merchantName?`Talão — ${result.merchantName}`:'Talão',merchantName:result.merchantName||null,merchantTaxNumber:result.merchantTaxNumber||null,origin:3,lines},token)
      onCreated(created);onClose()
      void api.validateReceiptParse(householdId,result.parseId,{isValid:!changed,notes},token).catch(()=>undefined)
    }catch(err){setError(err instanceof ApiError?err.message:'Não foi possível criar a despesa.')}
    finally{setLoading(false)}
  }
  const currentLinesTotal=result?(editing?result.lines.reduce((sum,line)=>sum+line.amount,0):result.linesTotal):0
  const linesDifference=result?Math.round((result.total-currentLinesTotal)*100)/100:0
  const totalsMatch=Math.abs(linesDifference)<.01
  return <ModalShell onClose={onClose} title="Digitalizar talão" subtitle="Transforma uma fotografia em despesas organizadas.">
    {!result?<div className="receipt-upload">
      {file?<><div className="file-preview"><FileText/><div><strong>{file.name}</strong><small>{(file.size/1024/1024).toFixed(2)} MB · pronto para analisar</small></div><button onClick={()=>setFile(undefined)}><X/></button></div><button className="primary-button full" onClick={parse} disabled={loading}>{loading?<LoaderCircle className="spin"/>:<Sparkles/>}{loading?'A analisar o teu talão…':'Analisar com Fings AI'}</button></>:<button className="drop-zone" onClick={()=>inputRef.current?.click()}><span><Upload/></span><strong>Carrega uma fotografia do talão</strong><small>JPEG, PNG ou WebP · até 10 MB</small><i>Escolher ficheiro</i></button>}
      <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0])}/>{error&&<div className="form-error">{error}</div>}<div className="privacy-note"><ShieldCheck/>A imagem é processada em segurança e não fica guardada.</div>
    </div>:<div className={`receipt-result ${editing?'editing':''}`}>
      {editing?<><div className="receipt-edit-heading"><div><span><Pencil size={15}/></span><div><strong>Rever dados extraídos</strong><small>Corrige os campos antes de criar a despesa.</small></div></div></div><div className="receipt-edit-header"><label>Comerciante<input value={result.merchantName||''} onChange={event=>setResult({...result,merchantName:event.target.value})}/></label><label>NIF<input value={result.merchantTaxNumber||''} onChange={event=>setResult({...result,merchantTaxNumber:event.target.value})}/></label><label>N.º documento<input value={result.documentNumber||''} onChange={event=>setResult({...result,documentNumber:event.target.value})}/></label><label>Data<DateInput required value={result.purchaseDate||''} onChange={purchaseDate=>setResult({...result,purchaseDate})}/></label><label>Moeda<input maxLength={3} value={result.currency} onChange={event=>setResult({...result,currency:event.target.value.toUpperCase()})}/></label><label>Subtotal<input type="number" min="0" step="0.01" value={result.subtotal??''} onChange={event=>setResult({...result,subtotal:event.target.value===''?null:Number(event.target.value)})}/></label><label>IVA<input type="number" min="0" step="0.01" value={result.tax??''} onChange={event=>setResult({...result,tax:event.target.value===''?null:Number(event.target.value)})}/></label><label>Total<input required type="number" min="0.01" step="0.01" value={result.total} onChange={event=>setResult({...result,total:Number(event.target.value)})}/></label></div><div className="receipt-editor-lines"><div className="receipt-editor-label"><strong>Parcelas do talão</strong><div><span>{result.lines.length} parcelas</span><button type="button" onClick={()=>setResult({...result,lines:[...result.lines,{description:'',quantity:1,unitPrice:null,amount:0,suggestedCategoryId:null,suggestedCategoryName:null,suggestedSubcategoryId:null,suggestedSubcategoryName:null,confidence:0}]})}><Plus size={13}/> Adicionar parcela</button></div></div>{result.lines.map((line,index)=><ReceiptLineEditor key={index} line={line} categories={categories} onChange={updated=>updateLine(index,updated)} onRemove={()=>setResult({...result,lines:result.lines.filter((_,itemIndex)=>itemIndex!==index)})}/>)}</div><label className="validation-notes">Notas sobre as correções <small>opcional</small><textarea maxLength={1000} value={validationNotes} onChange={event=>setValidationNotes(event.target.value)} placeholder="Ex.: Duas parcelas foram classificadas incorretamente."/></label></>:<><div className="result-merchant"><span><Check/></span><div><small>TALÃO ANALISADO</small><h3>{result.merchantName||'Comerciante não identificado'}</h3><p>{formatDate(result.purchaseDate)}{result.merchantTaxNumber?` · NIF ${result.merchantTaxNumber}`:''}{result.documentNumber?` · ${result.documentNumber}`:''}</p></div><strong>{euro.format(result.total)}</strong></div><div className="result-lines">{result.lines.map((line,index)=><ReceiptParsedLine key={index} line={line} categories={categories}/>)}</div></>}
      <div className={`receipt-totals ${totalsMatch?'matched':'different'}`}><div><span>Total das parcelas</span><strong>{euro.format(currentLinesTotal)}</strong></div><span className="receipt-total-connector"/><div><span>Total do talão</span><strong>{euro.format(result.total)}</strong></div><div className="receipt-total-status">{totalsMatch?<><Check size={14}/><span>Valores coincidentes</span></>:<><TriangleAlert size={14}/><span>Diferença de {euro.format(Math.abs(linesDifference))}</span></>}</div></div>
      {!!result.warnings?.length&&<aside className="receipt-warnings" role="alert"><span className="receipt-warning-icon"><TriangleAlert size={17}/></span><div className="receipt-warning-content"><span className="receipt-warning-label">Revisão recomendada</span><strong>Alguns dados podem precisar da tua atenção</strong><p>Confirma estes pontos antes de criares a despesa.</p><ul>{result.warnings.map((warning,index)=><li key={`${warning}-${index}`}>{warning}</li>)}</ul></div></aside>}
      {error&&<div className="form-error">{error}</div>}<div className="modal-actions">{editing?<button className="secondary-button" onClick={()=>{setResult(structuredClone(original));setEditing(false);setValidationNotes('');setError('')}}>Cancelar alterações</button>:<><button className="secondary-button" onClick={()=>{setResult(undefined);setOriginal(undefined)}}>Voltar</button><button className="secondary-button" onClick={()=>setEditing(true)}><Pencil size={15}/> Editar resultado</button></>}<button className="primary-button" disabled={loading} onClick={confirm}>{loading?<LoaderCircle className="spin"/>:<Check/>} Confirmar e criar despesa</button></div>
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

function SettingsPage({ user, categories, householdId, token, onUserUpdated, onCategoriesChanged }: { user: User; categories:Category[]; householdId:string; token: string; onUserUpdated: (user: User) => void; onCategoriesChanged:(categories:Category[])=>void }) {
  const [tab,setTab]=useState<'profile'|'categories'>('profile')
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

  return <><div className="page-heading"><div><p className="section-kicker">CONTA</p><h1>Definições</h1><p className="page-subtitle">Gere os dados do utilizador e a organização das despesas.</p></div></div><div className="settings-tabs" role="tablist"><button role="tab" aria-selected={tab==='profile'} className={tab==='profile'?'active':''} onClick={()=>setTab('profile')}><UserRound size={17}/> Dados do utilizador</button><button role="tab" aria-selected={tab==='categories'} className={tab==='categories'?'active':''} onClick={()=>setTab('categories')}><Tags size={17}/> Categorias</button></div>{tab==='profile'?<section className="panel settings-panel profile-settings-card"><div className="settings-profile-hero"><div className="settings-avatar large">{initials(user.name)}</div><div><h2>{user.name}</h2><p>@{user.username}</p></div>{!editing&&<button className="secondary-button" onClick={()=>{setEditing(true);setSuccess(false)}}><Pencil size={15}/> Editar dados</button>}</div>{editing?<form className="modal-form" onSubmit={save}><label>Nome<input autoFocus required maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Nome completo"/>{fieldErrors.name?.map(message => <small className="field-error" key={message}>{message}</small>)}</label><label>Username<input required maxLength={60} autoCapitalize="none" spellCheck={false} value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} placeholder="joao.silva"/>{fieldErrors.username?.map(message => <small className="field-error" key={message}>{message}</small>)}</label><div className="profile-email-note">O email <strong>{user.email}</strong> não é alterado nesta área.</div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>{setEditing(false);setForm({name:user.name,username:user.username});setError('');setFieldErrors({})}}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Check/>} {saving?'A guardar…':'Guardar alterações'}</button></div></form>:<div className="settings-readonly-grid"><div><small>Nome completo</small><strong>{user.name}</strong></div><div><small>Username</small><strong>@{user.username}</strong></div><div><small>Email</small><strong>{user.email}</strong></div></div>}{success&&!editing&&<div className="form-success settings-success"><Check size={15}/> Dados atualizados com sucesso.</div>}</section>:<CategorySettings categories={categories} householdId={householdId} token={token} onChanged={onCategoriesChanged}/>}</>
}

function PeriodSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [year, month] = value.split('-')
  return <fieldset className="period-select"><legend>{label}</legend><div><select aria-label={`${label}: ano`} value={year} onChange={event => onChange(`${event.target.value}-${month}`)}>{periodYears.map(option => <option key={option} value={option}>{option}</option>)}</select><select aria-label={`${label}: mês`} value={month} onChange={event => onChange(`${year}-${event.target.value}`)}>{periodMonths.map(option => <option key={option} value={option}>{option}</option>)}</select></div></fieldset>
}

function BudgetModal({ householdId, token, onClose, onCreated }: {householdId:string;token:string;onClose:()=>void;onCreated:(b:Budget)=>void}) {const [form,setForm]=useState({name:'',startMonth:initialMonth,endMonth:initialMonth,monthlyAmount:''});const [saving,setSaving]=useState(false);const [error,setError]=useState('');async function save(e:FormEvent){e.preventDefault();setError('');if(form.startMonth>form.endMonth){setError('O mês final deve ser igual ou posterior ao mês inicial.');return}setSaving(true);try{const payload={name:form.name,startMonth:`${form.startMonth}-01`,endMonth:`${form.endMonth}-01`,monthlyAmount:Number(form.monthlyAmount),allocations:[]};const created=await api.createBudget(householdId,payload,token);onCreated(created);onClose()}catch(err){setError(err instanceof ApiError?err.message:'Não foi possível criar o orçamento.')}finally{setSaving(false)}}return <ModalShell onClose={onClose} title="Novo orçamento" subtitle="Planeia um valor mensal para um período."><form className="modal-form" onSubmit={save}><label>Nome do orçamento<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Primeiro semestre"/></label><div className="input-pair"><PeriodSelect label="Mês inicial" value={form.startMonth} onChange={startMonth=>setForm({...form,startMonth})}/><PeriodSelect label="Mês final" value={form.endMonth} onChange={endMonth=>setForm({...form,endMonth})}/></div><label className="amount-label">Valor mensal<div className="amount-input small"><span>€</span><input required inputMode="decimal" value={form.monthlyAmount} onChange={e=>setForm({...form,monthlyAmount:e.target.value})} placeholder="0,00"/></div></label><div className="info-box"><Sparkles/><span>A Fings irá criar uma receita planeada para cada mês deste período.</span></div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving?<LoaderCircle className="spin"/>:<Check/>} Criar orçamento</button></div></form></ModalShell>}

function App() {
  const [token,setToken]=useState(()=>sessionStorage.getItem('fings_token')||'')
  const [view,setView]=useState<View>('overview');const [modal,setModal]=useState<Modal>(null);const [mobileOpen,setMobileOpen]=useState(false)
  const [user,setUser]=useState<User>()
  const [period,setPeriod]=useState(initialPeriod)
  const [movementPeriod,setMovementPeriod]=useState(initialPeriod)
  const [households,setHouseholds]=useState<Household[]>([]);const [household,setHousehold]=useState<Household>();const [categories,setCategories]=useState<Category[]>([]);const [expenses,setExpenses]=useState<Expense[]>([]);const [dashboard,setDashboard]=useState<Dashboard>();const [budgets,setBudgets]=useState<Budget[]>([]);const [recurring,setRecurring]=useState<RecurringExpense[]>([]);const [loading,setLoading]=useState(false);const [loadError,setLoadError]=useState('')
  const [movementExpenses,setMovementExpenses]=useState<Expense[]>([]);const [movementLoading,setMovementLoading]=useState(false)
  const [editingExpense,setEditingExpense]=useState<Expense|null>(null);const [dataRevision,setDataRevision]=useState(0)
  const [creatingRecurring,setCreatingRecurring]=useState(false)
  const [editingRecurring,setEditingRecurring]=useState<RecurringExpense|null>(null)
  const authenticated=!!token
  const householdId=household?.id||''
  const periodLabel=new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(new Date(period.year,period.month-1,1))
  const movementPeriodLabel=new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(new Date(movementPeriod.year,movementPeriod.month-1,1))

  useEffect(()=>{const clearSession=()=>{sessionStorage.removeItem('fings_token');setToken('');setUser(undefined);setHousehold(undefined);setDashboard(undefined)};window.addEventListener('fings:unauthorized',clearSession);return()=>window.removeEventListener('fings:unauthorized',clearSession)},[])
  useEffect(()=>{if(!token)return;setLoading(true);setLoadError('');(async()=>{try{const [me,hs]=await Promise.all([api.me(token),api.households(token)]);setUser(me);setHouseholds(hs);setHousehold(hs[0])}catch(e){setLoadError(e instanceof ApiError?e.message:'Não foi possível carregar a conta.')}finally{setLoading(false)}})()},[token])
  useEffect(()=>{if(!token||!household)return;setLoading(true);setLoadError('');setDashboard(undefined);const month=String(period.month).padStart(2,'0');const from=`${period.year}-${month}-01`;const to=`${period.year}-${month}-${String(new Date(period.year,period.month,0).getDate()).padStart(2,'0')}`;Promise.all([api.categories(household.id,token),api.expenses(household.id,from,to,token),api.dashboard(household.id,period.year,period.month,token),api.budgets(household.id,token),api.recurringExpenses(household.id,token)]).then(([c,e,d,b,r])=>{setCategories(c);setExpenses(e);setDashboard(d);setBudgets(b);setRecurring(r)}).catch(e=>{setExpenses([]);setLoadError(e instanceof ApiError?e.message:'Não foi possível carregar os dados.')}).finally(()=>setLoading(false))},[household,token,period,dataRevision])
  useEffect(()=>{if(!token||!household||view!=='expenses')return;setMovementLoading(true);const month=String(movementPeriod.month).padStart(2,'0');const from=`${movementPeriod.year}-${month}-01`;const to=`${movementPeriod.year}-${month}-${String(new Date(movementPeriod.year,movementPeriod.month,0).getDate()).padStart(2,'0')}`;api.expenses(household.id,from,to,token).then(setMovementExpenses).catch(e=>{setMovementExpenses([]);setLoadError(e instanceof ApiError?e.message:'Não foi possível carregar os movimentos.')}).finally(()=>setMovementLoading(false))},[household,token,view,movementPeriod,dataRevision])
  const title=useMemo(()=>({overview:'Visão geral',expenses:'Movimentos',budgets:'Orçamentos',recurring:'Recorrentes',settings:'Definições'})[view],[view]);useEffect(()=>{document.title=`${title} — Fings`},[title])
  function login(t:string){sessionStorage.setItem('fings_token',t);setToken(t)}
  function logout(){sessionStorage.removeItem('fings_token');setToken('');setUser(undefined);setHousehold(undefined);setDashboard(undefined);setView('overview')}
  function changePeriod(offset:number){setPeriod(current=>{const date=new Date(current.year,current.month-1+offset,1);return {year:date.getFullYear(),month:date.getMonth()+1}})}
  function changeMovementPeriod(offset:number){setMovementPeriod(current=>{const date=new Date(current.year,current.month-1+offset,1);return {year:date.getFullYear(),month:date.getMonth()+1}})}
  if(!authenticated)return <Auth onAuthenticated={login}/>
  if(!user)return <div className="page-loader"><LoaderCircle className="spin"/><span>A carregar os dados da conta…</span></div>
  return <div className="app-shell">
    <Sidebar view={view} setView={setView} mobileOpen={mobileOpen} close={()=>setMobileOpen(false)} onLogout={logout}/>
    <div className="app-main">
      <Topbar user={user} household={household} households={households} setHousehold={setHousehold} onMenu={()=>setMobileOpen(true)} onLogout={logout}/>
      <main className="content">
        {loadError&&<div className="page-error">{loadError}</div>}
        {loading?<div className="page-loader"><LoaderCircle className="spin"/><span>A organizar as tuas finanças…</span></div>:<>
          {view==='overview'&&<Overview dashboard={dashboard} expenses={expenses} categories={categories} user={user} periodLabel={periodLabel} changePeriod={changePeriod} openModal={setModal} setView={setView}/>} 
          {view==='expenses'&&<ExpensesPage expenses={movementExpenses} categories={categories} periodLabel={movementPeriodLabel} loading={movementLoading} changePeriod={changeMovementPeriod} openModal={setModal} onEdit={setEditingExpense}/>} 
          {view==='budgets'&&<BudgetsPage dashboard={dashboard} budgets={budgets} openModal={setModal}/>} 
          {view==='recurring'&&<RecurringPage items={recurring} categories={categories} onCreate={()=>setCreatingRecurring(true)} onEdit={setEditingRecurring} onMaterialize={async item=>{const result=await api.materializeRecurringExpense(householdId,item.id,token);setRecurring(current=>current.map(existing=>existing.id===item.id?{...existing,nextOccurrenceDate:result.nextOccurrenceDate,isActive:result.isActive}:existing));setDataRevision(current=>current+1);return result}}/>}
          {view==='settings'&&<SettingsPage user={user} categories={categories} householdId={householdId} token={token} onUserUpdated={setUser} onCategoriesChanged={setCategories}/>} 
        </>}
      </main>
      <PoweredBy className="app-powered" />
    </div>
    {modal==='expense'&&<ExpenseModal categories={categories} householdId={householdId} token={token} onClose={()=>setModal(null)} onSaved={()=>setDataRevision(current=>current+1)}/>} 
    {editingExpense&&<ExpenseModal item={editingExpense} categories={categories} householdId={householdId} token={token} onClose={()=>setEditingExpense(null)} onSaved={()=>setDataRevision(current=>current+1)}/>} 
    {modal==='receipt'&&<ReceiptModal householdId={householdId} token={token} categories={categories} onClose={()=>setModal(null)} onCreated={()=>setDataRevision(current=>current+1)}/>} 
    {modal==='budget'&&<BudgetModal householdId={householdId} token={token} onClose={()=>setModal(null)} onCreated={b=>setBudgets([b,...budgets])}/>} 
    {creatingRecurring&&<RecurringExpenseModal categories={categories} householdId={householdId} token={token} onClose={()=>setCreatingRecurring(false)} onSaved={created=>setRecurring(current=>[created,...current])}/>} 
    {editingRecurring&&<RecurringExpenseModal item={editingRecurring} categories={categories} householdId={householdId} token={token} onClose={()=>setEditingRecurring(null)} onSaved={updated=>setRecurring(current=>current.map(item=>item.id===updated.id?updated:item))}/>} 
  </div>
}

export default App
