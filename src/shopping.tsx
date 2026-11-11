import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Archive, ArrowRight, Camera, Check, CheckCircle2, ChevronDown, CircleHelp, ImagePlus, ListChecks, LoaderCircle, PackageCheck, Pencil, Plus, RotateCcw, ShoppingBasket, Sparkles, Trash2, X } from 'lucide-react'
import { api, ApiError, type ExpenseMatch, type ShoppingList, type ShoppingListItem, type ShoppingListItemPayload } from './api'

const money = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const quantity = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 })

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function Overlay({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-layer"><div className="modal-card shopping-modal" role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button aria-label="Fechar" onClick={onClose}><X /></button></div>
    {children}
  </div></div>
}

type ItemDraft = { productName: string; brand: string; quantity: string; unit: string; expectedPrice: string; notes: string }
const emptyItem: ItemDraft = { productName: '', brand: '', quantity: '', unit: 'un', expectedPrice: '', notes: '' }

function draftFromItem(item?: ShoppingListItem): ItemDraft {
  return item ? { productName: item.productName, brand: item.brand || '', quantity: item.quantity == null ? '' : String(item.quantity), unit: item.unit || '', expectedPrice: item.expectedPrice == null ? '' : String(item.expectedPrice), notes: item.notes || '' } : emptyItem
}

function itemPayload(draft: ItemDraft): ShoppingListItemPayload {
  return { productName: draft.productName.trim(), brand: draft.brand.trim() || null, quantity: draft.quantity ? Number(draft.quantity.replace(',', '.')) : null, unit: draft.unit.trim() || null, expectedPrice: draft.expectedPrice ? Number(draft.expectedPrice.replace(',', '.')) : null, notes: draft.notes.trim() || null }
}

function ItemModal({ householdId, token, list, item, onClose, onSaved }: { householdId: string; token: string; list: ShoppingList; item?: ShoppingListItem; onClose: () => void; onSaved: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'manual' | 'photo'>(item ? 'manual' : 'manual')
  const [draft, setDraft] = useState(() => draftFromItem(item))
  const [detectedItem, setDetectedItem] = useState<ShoppingListItem>()
  const [confidence, setConfidence] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function upload(file?: File) {
    if (!file) return
    setBusy(true); setError('')
    try {
      const result = await api.addShoppingListItemFromImage(householdId, list.id, file, token)
      setDetectedItem(result.item); setConfidence(result.recognition.confidence); setDraft(draftFromItem(result.item)); setMode('manual')
      onSaved()
    } catch (reason) { setError(errorMessage(reason, 'Não foi possível reconhecer o produto.')) }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setError('')
    const payload = itemPayload(draft)
    if (!payload.productName) { setError('Indica o nome do produto.'); return }
    if (payload.quantity != null && (!Number.isFinite(payload.quantity) || payload.quantity <= 0)) { setError('A quantidade deve ser superior a zero.'); return }
    if (payload.expectedPrice != null && (!Number.isFinite(payload.expectedPrice) || payload.expectedPrice < 0)) { setError('O preço não pode ser negativo.'); return }
    setBusy(true)
    try {
      if (item || detectedItem) await api.updateShoppingListItem(householdId, list.id, (item || detectedItem)!.id, payload, token)
      else await api.addShoppingListItem(householdId, list.id, payload, token)
      onSaved(); onClose()
    } catch (reason) { setError(errorMessage(reason, 'Não foi possível guardar o produto.')) }
    finally { setBusy(false) }
  }
  return <Overlay title={item ? 'Editar produto' : detectedItem ? 'Confirmar produto' : 'Adicionar produto'} subtitle={`Na lista “${list.name}”`} onClose={onClose}>
    {!item && !detectedItem && <div className="shopping-entry-tabs"><button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}><Pencil /> Escrever</button><button className={mode === 'photo' ? 'active' : ''} onClick={() => setMode('photo')}><Camera /> Fotografar</button></div>}
    {mode === 'photo' && !detectedItem ? <div className="shopping-photo-entry">
      <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => upload(event.target.files?.[0])} />
      <button className="shopping-photo-drop" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <LoaderCircle className="spin" /> : <ImagePlus />}<strong>{busy ? 'A reconhecer o produto…' : 'Fotografar ou escolher imagem'}</strong><span>JPEG, PNG ou WebP · máximo 10 MB</span></button>
      {error && <div className="form-error">{error}</div>}
    </div> : <form className="modal-form shopping-item-form" onSubmit={save}>
      {detectedItem && <div className={`recognition-note ${(confidence || 0) < .8 ? 'review' : ''}`}><Sparkles /><div><strong>{(confidence || 0) < .8 ? 'Confirma os dados reconhecidos' : 'Produto reconhecido'}</strong><span>{Math.round((confidence || 0) * 100)}% de confiança · podes corrigir antes de guardar</span></div></div>}
      <label>Produto<input autoFocus required maxLength={250} value={draft.productName} onChange={event => setDraft({ ...draft, productName: event.target.value })} placeholder="Ex.: Leite meio gordo" /></label>
      <div className="input-pair"><label>Marca <small>opcional</small><input value={draft.brand} onChange={event => setDraft({ ...draft, brand: event.target.value })} placeholder="Ex.: Mimosa" /></label><label>Preço esperado <small>opcional</small><div className="shopping-price-input"><span>€</span><input inputMode="decimal" value={draft.expectedPrice} onChange={event => setDraft({ ...draft, expectedPrice: event.target.value })} placeholder="0,00" /></div></label></div>
      <div className="input-pair"><label>Quantidade <small>opcional</small><input inputMode="decimal" value={draft.quantity} onChange={event => setDraft({ ...draft, quantity: event.target.value })} placeholder="1" /></label><label>Unidade <small>opcional</small><input value={draft.unit} onChange={event => setDraft({ ...draft, unit: event.target.value })} placeholder="un, kg, L…" /></label></div>
      <label>Notas <small>opcional</small><textarea rows={3} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="Preferências, tamanho ou variedade" /></label>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Check />} {detectedItem ? 'Confirmar produto' : 'Guardar produto'}</button></div>
    </form>}
  </Overlay>
}

function RenameListModal({ householdId, token, list, onClose, onSaved }: { householdId: string; token: string; list: ShoppingList; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(list.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(event: FormEvent) {
    event.preventDefault(); if (!name.trim()) return; setBusy(true); setError('')
    try { await api.updateShoppingList(householdId, list.id, { name: name.trim(), status: list.status }, token); onSaved(); onClose() }
    catch (reason) { setError(errorMessage(reason, 'Não foi possível alterar o nome da lista.')) }
    finally { setBusy(false) }
  }
  return <Overlay title="Editar lista" subtitle="Dá-lhe um nome fácil de reconhecer." onClose={onClose}><form className="modal-form" onSubmit={save}><label>Nome da lista<input autoFocus required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" /> : <Check />} Guardar</button></div></form></Overlay>
}

export function ShoppingListsPage({ householdId, token, readOnly, revision = 0, onChanged }: { householdId: string; token: string; readOnly: boolean; revision?: number; onChanged?: () => void }) {
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [pendingMatches, setPendingMatches] = useState<ExpenseMatch[]>([])
  const [reviewingMatches, setReviewingMatches] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newList, setNewList] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedList, setSelectedList] = useState<ShoppingList>()
  const [editingItem, setEditingItem] = useState<ShoppingListItem>()
  const [renamingList, setRenamingList] = useState<ShoppingList>()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const load = async () => { setLoading(true); setError(''); try { const [nextLists, matches] = await Promise.all([api.shoppingLists(householdId, token, false, true), api.expenseMatches(householdId, token, 'Pending')]); setLists(nextLists); setPendingMatches(matches) } catch (reason) { setError(errorMessage(reason, 'Não foi possível carregar as listas.')) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [householdId, token, revision])
  const visible = lists.filter(list => showArchived ? list.status === 'Archived' : list.status === 'Active')
  const activeItems = lists.filter(list => list.status === 'Active').reduce((sum, list) => sum + list.activeItemCount, 0)
  async function createList(event: FormEvent) { event.preventDefault(); if (!newList.trim()) return; setCreating(true); setError(''); try { await api.createShoppingList(householdId, newList.trim(), token); setNewList(''); await load(); onChanged?.() } catch (reason) { setError(errorMessage(reason, 'Não foi possível criar a lista.')) } finally { setCreating(false) } }
  async function archive(list: ShoppingList) { if (!window.confirm(`Arquivar “${list.name}”? O histórico será mantido.`)) return; try { await api.archiveShoppingList(householdId, list.id, token); await load(); onChanged?.() } catch (reason) { setError(errorMessage(reason, 'Não foi possível arquivar a lista.')) } }
  async function removeItem(list: ShoppingList, item: ShoppingListItem) { if (!window.confirm(`Remover “${item.productName}” desta lista?`)) return; try { await api.removeShoppingListItem(householdId, list.id, item.id, token); await load(); onChanged?.() } catch (reason) { setError(errorMessage(reason, 'Não foi possível remover o produto.')) } }
  async function restore(list: ShoppingList) { try { await api.updateShoppingList(householdId, list.id, { name: list.name, status: 'Active' }, token); await load(); onChanged?.() } catch (reason) { setError(errorMessage(reason, 'Não foi possível reativar a lista.')) } }
  function toggle(id: string) { setExpanded(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next }) }
  return <div className="shopping-page">
    <div className="page-heading shopping-heading"><div><p className="greeting">Compras sem esquecimentos</p><h1>Listas de compras</h1><p>Planeia em conjunto e confirma automaticamente o que entrou no carrinho.</p></div>{!readOnly && <form onSubmit={createList}><input aria-label="Nome da nova lista" value={newList} onChange={event => setNewList(event.target.value)} placeholder="Ex.: Compras da semana" /><button className="primary-button" disabled={creating || !newList.trim()}>{creating ? <LoaderCircle className="spin" /> : <Plus />} Nova lista</button></form>}</div>
    <section className="shopping-overview"><div><span><ShoppingBasket /></span><div><small>POR COMPRAR</small><strong>{activeItems} {activeItems === 1 ? 'produto' : 'produtos'}</strong></div></div><div><span><ListChecks /></span><div><small>LISTAS ATIVAS</small><strong>{lists.filter(list => list.status === 'Active').length}</strong></div></div><p><Sparkles /> Ao inserires uma despesa com parcelas, a Fings propõe correspondências para confirmares.</p></section>
    {pendingMatches.length > 0 && <section className="pending-match-banner"><span><PackageCheck /></span><div><small>REVISÃO PENDENTE</small><strong>{pendingMatches.length} {pendingMatches.length === 1 ? 'compra pronta' : 'compras prontas'} para confirmar</strong><p>Revê as sugestões antes de atualizarmos as quantidades das listas.</p></div>{!readOnly && <button onClick={() => setReviewingMatches(true)}>Rever agora <ArrowRight /></button>}</section>}
    <div className="shopping-filter"><button className={!showArchived ? 'active' : ''} onClick={() => setShowArchived(false)}>Ativas <span>{lists.filter(list => list.status === 'Active').length}</span></button><button className={showArchived ? 'active' : ''} onClick={() => setShowArchived(true)}>Arquivo <span>{lists.filter(list => list.status === 'Archived').length}</span></button></div>
    {error && <div className="page-error">{error}</div>}
    {loading ? <div className="shopping-empty"><LoaderCircle className="spin" /><strong>A preparar as tuas listas…</strong></div> : visible.length === 0 ? <div className="shopping-empty"><ShoppingBasket /><strong>{showArchived ? 'Ainda não há listas arquivadas' : 'Cria a tua primeira lista'}</strong><p>{showArchived ? 'As listas arquivadas ficam aqui, com todo o histórico.' : 'Adiciona os produtos e deixa a Fings ajudar no próximo talão.'}</p></div> : <div className="shopping-list-grid">{visible.map(list => {
      const open = expanded.has(list.id); const pending = list.items.filter(item => item.status === 'Active'); const done = list.items.filter(item => item.status === 'Purchased'); const relevantCount = pending.length + done.length
      return <article className={`shopping-list-card ${list.status === 'Archived' ? 'archived' : ''}`} key={list.id}>
        <header><button className="shopping-list-title" onClick={() => toggle(list.id)} aria-expanded={open}><span><ShoppingBasket /></span><div><strong>{list.name}</strong><small>{list.activeItemCount ? `${list.activeItemCount} por comprar` : 'Tudo tratado'}</small></div><ChevronDown className={open ? 'open' : ''} /></button>{!readOnly && list.status === 'Active' && <div className="shopping-list-actions"><button title="Adicionar produto" onClick={() => { setSelectedList(list); setEditingItem(undefined) }}><Plus /></button><button title="Editar nome" onClick={() => setRenamingList(list)}><Pencil /></button><button title="Arquivar lista" onClick={() => archive(list)}><Archive /></button></div>}{!readOnly && list.status === 'Archived' && <button className="restore-list" onClick={() => restore(list)}><RotateCcw /> Reativar</button>}</header>
        <div className="shopping-progress"><i style={{ width: `${relevantCount ? done.length / relevantCount * 100 : 0}%` }} /></div>
        {open && <div className="shopping-items">{pending.length === 0 && done.length === 0 ? <div className="shopping-list-empty">Esta lista ainda está vazia.</div> : <>{pending.map(item => <div className="shopping-item" key={item.id}><span className="shopping-item-check" /><div><strong>{item.productName}</strong><small>{[item.brand, item.variant, item.quantity != null ? `${quantity.format(item.quantity)}${item.unit ? ` ${item.unit}` : ''}` : null].filter(Boolean).join(' · ') || 'Sem detalhes'}{item.expectedPrice != null ? ` · ${money.format(item.expectedPrice)}` : ''}</small>{item.notes && <em>{item.notes}</em>}</div>{item.source === 'ProductPhoto' && <span className="photo-badge"><Camera /> foto</span>}{!readOnly && <div className="shopping-item-actions"><button aria-label={`Editar ${item.productName}`} onClick={() => { setSelectedList(list); setEditingItem(item) }}><Pencil /></button><button aria-label={`Remover ${item.productName}`} onClick={() => removeItem(list, item)}><Trash2 /></button></div>}</div>)}{done.length > 0 && <details className="shopping-completed"><summary><CheckCircle2 /> {done.length} {done.length === 1 ? 'comprado' : 'comprados'}</summary>{done.map(item => <div key={item.id}><Check /> <span>{item.productName}</span></div>)}</details>}</>}</div>}
        {!open && pending.length > 0 && <div className="shopping-preview">{pending.slice(0, 3).map(item => <span key={item.id}>{item.productName}</span>)}{pending.length > 3 && <span>+{pending.length - 3}</span>}</div>}
      </article>
    })}</div>}
    {selectedList && <ItemModal householdId={householdId} token={token} list={selectedList} item={editingItem} onClose={() => { setSelectedList(undefined); setEditingItem(undefined) }} onSaved={() => { void load(); onChanged?.() }} />}
    {renamingList && <RenameListModal householdId={householdId} token={token} list={renamingList} onClose={() => setRenamingList(undefined)} onSaved={() => { void load(); onChanged?.() }} />}
    {reviewingMatches && <ExpenseMatchesModal householdId={householdId} token={token} matches={pendingMatches} onClose={() => { setReviewingMatches(false); void load() }} onChanged={() => { onChanged?.() }} />}
  </div>
}

type MatchChoice = { quantity: string }

export function ExpenseMatchesModal({ householdId, token, matches: initialMatches, onClose, onChanged }: { householdId: string; token: string; matches: ExpenseMatch[]; onClose: () => void; onChanged: () => void }) {
  const [matches, setMatches] = useState(initialMatches)
  const [drafts, setDrafts] = useState<Record<string, MatchChoice>>(() => Object.fromEntries(initialMatches.map(match => [match.id, { quantity: match.detectedPurchasedQuantity == null ? '' : String(match.detectedPurchasedQuantity) }])))
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState('')
  const pending = matches.filter(match => match.status === 'Pending')
  const reviewed = matches.length - pending.length
  const grouped = useMemo(() => new Set(initialMatches.map(match => match.shoppingListId)).size, [initialMatches])
  async function decide(match: ExpenseMatch, decision: 'Approved' | 'Rejected', force = false) {
    setBusy(match.id); setError('')
    try {
      let purchasedQuantity: number | undefined
      if (decision === 'Approved') {
        const raw = force ? match.requestedQuantityAtDetection : drafts[match.id]?.quantity
        if (raw != null && raw !== '') purchasedQuantity = Number(typeof raw === 'string' ? raw.replace(',', '.') : raw)
        if (purchasedQuantity != null && (!Number.isFinite(purchasedQuantity) || purchasedQuantity <= 0)) { setError('Indica uma quantidade comprada válida.'); return }
      }
      const updated = await api.reviewExpenseMatch(householdId, match.id, { decision, ...(purchasedQuantity == null ? {} : { purchasedQuantity }) }, token)
      setMatches(current => current.map(item => item.id === match.id ? updated : item)); onChanged()
    } catch (reason) { setError(errorMessage(reason, 'Não foi possível guardar esta decisão.')) }
    finally { setBusy(undefined) }
  }
  return <Overlay title="Confirmar compras da lista" subtitle={`${initialMatches.length} ${initialMatches.length === 1 ? 'correspondência encontrada' : 'correspondências encontradas'} em ${grouped} ${grouped === 1 ? 'lista' : 'listas'}`} onClose={onClose}>
    <div className="match-review">
      <div className="match-intro"><span><Sparkles /></span><div><strong>A despesa foi validada. Falta só confirmar estes matches.</strong><p>Nada é removido automaticamente. Confirma a quantidade encontrada, mantém o produto na lista ou conclui-o por inteiro.</p></div><em>{reviewed}/{matches.length}</em></div>
      {error && <div className="form-error">{error}</div>}
      <div className="match-list">{matches.map(match => {
        const requested = match.requestedQuantityAtDetection; const detected = match.detectedPurchasedQuantity
        const partial = requested != null && detected != null && detected < requested
        const canForce = requested != null && (detected == null || detected < requested)
        const complete = requested == null || detected != null && detected >= requested
        const enteredQuantity = Number((drafts[match.id]?.quantity || '0').replace(',', '.'))
        const previewRemaining = Math.max(0, (requested || 0) - (Number.isFinite(enteredQuantity) ? enteredQuantity : 0))
        return <article className={`match-card ${match.status !== 'Pending' ? 'reviewed' : ''}`} key={match.id}>
          <div className="match-card-head"><span className={`match-confidence ${match.confidence >= .8 ? 'high' : ''}`}>{Math.round(match.confidence * 100)}%</span><div><small>{match.shoppingListName}</small><h3>{match.productName}</h3></div>{match.status !== 'Pending' && <span className={`match-decision ${match.status.toLowerCase()}`}><Check /> {match.status === 'Approved' ? 'Confirmado' : 'Mantido'}</span>}</div>
          {match.status === 'Pending' && <><div className="match-comparison"><div><small>NA LISTA</small><strong>{requested == null ? 'Sem quantidade' : `${quantity.format(requested)} pedido${requested === 1 ? '' : 's'}`}</strong></div><ArrowRight /><div><small>NO TALÃO</small><strong>{detected == null ? 'Quantidade por indicar' : `${quantity.format(detected)} encontrado${detected === 1 ? '' : 's'}`}</strong></div><span className={partial ? 'partial' : complete ? 'complete' : 'attention'}>{partial ? 'Compra parcial' : complete ? 'Pode concluir' : 'Confirma a quantidade'}</span></div>
            <div className="match-source"><ReceiptLineIcon /><span>“{match.expenseLineDescription}”</span></div>
            <label className="match-quantity">Quantidade comprada<input inputMode="decimal" value={drafts[match.id]?.quantity || ''} onChange={event => setDrafts({ ...drafts, [match.id]: { quantity: event.target.value } })} placeholder="Indica a quantidade" /></label>
            {canForce && <p className="match-outcome">Ao confirmar esta quantidade, ficam <strong>{quantity.format(previewRemaining)}</strong> por comprar.</p>}
            <div className="match-actions"><button className="keep-button" disabled={!!busy} onClick={() => decide(match, 'Rejected')}><X /> Manter na lista</button><button className="confirm-match" disabled={!!busy} onClick={() => decide(match, 'Approved')}>{busy === match.id ? <LoaderCircle className="spin" /> : <Check />} Confirmar compra</button>{canForce && <button className="force-match" disabled={!!busy} onClick={() => decide(match, 'Approved', true)}><PackageCheck /> Concluir por inteiro</button>}</div>
          </>}
        </article>
      })}</div>
      <div className="match-footer"><div><CircleHelp /><span>Podes fechar e rever os matches pendentes mais tarde em <strong>Listas</strong>.</span></div><button className="primary-button" onClick={onClose}>{pending.length ? 'Terminar mais tarde' : 'Concluir revisão'} <ArrowRight /></button></div>
    </div>
  </Overlay>
}

function ReceiptLineIcon() { return <span className="match-receipt-icon"><span /><span /><span /></span> }
