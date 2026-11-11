import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, ChevronRight, CircleOff, LoaderCircle, Package, Pencil, Plus, Search, Sparkles, X } from 'lucide-react'
import { api, ApiError, type Category, type ProductType } from './api'

function message(error: unknown, fallback: string) { return error instanceof ApiError ? error.message : fallback }

export function ProductTypePicker({ items, selectedId, onSelect, onCreate, loading = false, heading = 'Que tipo de produto queres adicionar?', hint = 'Escolhe o tipo para prepararmos automaticamente o contexto certo.' }: { items: ProductType[]; selectedId?: string; onSelect: (item: ProductType) => void; onCreate?: (suggestedName: string) => void; loading?: boolean; heading?: string; hint?: string }) {
  const [search, setSearch] = useState('')
  const normalized = search.trim().toLocaleLowerCase('pt-PT')
  const visible = useMemo(() => items.filter(item => item.isActive && (!normalized || `${item.name} ${item.categoryName} ${item.subcategoryName || ''}`.toLocaleLowerCase('pt-PT').includes(normalized))), [items, normalized])
  const groups = useMemo(() => Array.from(new Set(visible.map(item => item.categoryName))).map(category => [category, visible.filter(item => item.categoryName === category)] as const), [visible])
  return <section className="product-type-picker">
    <header><span><Sparkles /></span><div><h3>{heading}</h3><p>{hint}</p></div></header>
    <label className="product-type-search"><Search /><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar leite, arroz, champô…" />{search && <button type="button" aria-label="Limpar pesquisa" onClick={() => setSearch('')}><X /></button>}</label>
    {loading ? <div className="product-type-picker-state"><LoaderCircle className="spin" /> A carregar tipos de produto…</div> : groups.length ? <div className="product-type-groups">{groups.map(([category, products]) => <div key={category}><small>{category}</small><div>{products.map(item => <button type="button" className={selectedId === item.id ? 'selected' : ''} key={item.id} onClick={() => onSelect(item)}><span><Package /></span><div><strong>{item.name}</strong><small>{item.subcategoryName || 'Sem subcategoria'}</small></div>{selectedId === item.id ? <Check /> : <ChevronRight />}</button>)}</div></div>)}</div> : <div className="product-type-picker-state"><Package /> {search ? 'Nenhum tipo corresponde à pesquisa.' : 'Ainda não existem tipos de produto ativos.'}</div>}
    {onCreate && !loading && <button type="button" className="product-type-quick-create" onClick={() => onCreate(search.trim())}><Plus /><span><strong>{search && !groups.length ? `Criar “${search.trim()}”` : 'Não encontras o tipo?'}</strong><small>Adiciona-o ao catálogo sem sair daqui</small></span><ChevronRight /></button>}
  </section>
}

type Draft = { name: string; categoryId: string; subcategoryId: string; isActive: boolean }

function ProductTypeEditor({ item, categories, saving, error, onCancel, onSave }: { item?: ProductType; categories: Category[]; saving: boolean; error: string; onCancel: () => void; onSave: (draft: Draft) => void }) {
  const [draft, setDraft] = useState<Draft>({ name: item?.name || '', categoryId: item?.categoryId || categories[0]?.id || '', subcategoryId: item?.subcategoryId || '', isActive: item?.isActive ?? true })
  const category = categories.find(value => value.id === draft.categoryId)
  function submit(event: FormEvent) { event.preventDefault(); onSave({ ...draft, name: draft.name.trim() }) }
  return <form className="product-type-editor" onSubmit={submit}><div className="category-setting-title"><div><strong>{item ? 'Editar tipo de produto' : 'Novo tipo de produto'}</strong><small>O tipo define a classificação; marca e quantidade ficam em cada compra.</small></div><button type="button" aria-label="Cancelar" onClick={onCancel}><X /></button></div><div className="product-type-editor-fields"><label>Nome<input autoFocus required maxLength={250} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Iogurte" /></label><label>Categoria<select required value={draft.categoryId} onChange={event => setDraft({ ...draft, categoryId: event.target.value, subcategoryId: '' })}><option value="">Selecionar</option>{categories.map(value => <option value={value.id} key={value.id}>{value.name}</option>)}</select></label><label>Subcategoria <small>opcional</small><select value={draft.subcategoryId} disabled={!category} onChange={event => setDraft({ ...draft, subcategoryId: event.target.value })}><option value="">Sem subcategoria</option>{category?.subcategories.map(value => <option value={value.id} key={value.id}>{value.name}</option>)}</select></label>{item && <label className="product-active-switch"><input type="checkbox" checked={draft.isActive} onChange={event => setDraft({ ...draft, isActive: event.target.checked })} /><span><i /></span><div><strong>Tipo ativo</strong><small>Disponível em novas entradas manuais</small></div></label>}<button className="primary-button" disabled={saving || !draft.name || !draft.categoryId}>{saving ? <LoaderCircle className="spin" /> : <Check />} {saving ? 'A guardar…' : 'Guardar tipo'}</button></div>{error && <div className="form-error">{error}</div>}</form>
}

export function ProductTypesSettings({ householdId, token, categories }: { householdId: string; token: string; categories: Category[] }) {
  const [items, setItems] = useState<ProductType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<ProductType | 'new'>()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [error, setError] = useState('')
  const load = async () => { setLoading(true); setError(''); try { setItems(await api.productTypes(householdId, token, true)) } catch (reason) { setError(message(reason, 'Não foi possível carregar os tipos de produto.')) } finally { setLoading(false) } }
  useEffect(() => { void load() }, [householdId, token])
  const visible = items.filter(item => (showInactive || item.isActive) && (!search.trim() || `${item.name} ${item.categoryName} ${item.subcategoryName || ''}`.toLocaleLowerCase('pt-PT').includes(search.trim().toLocaleLowerCase('pt-PT'))))
  async function save(draft: Draft) {
    setSaving(true); setError('')
    try {
      if (editing && editing !== 'new') await api.updateProductType(householdId, editing.id, { name: draft.name, categoryId: draft.categoryId, subcategoryId: draft.subcategoryId || null, isActive: draft.isActive }, token)
      else await api.createProductType(householdId, { name: draft.name, categoryId: draft.categoryId, subcategoryId: draft.subcategoryId || null }, token)
      setEditing(undefined); await load()
    } catch (reason) { setError(message(reason, 'Não foi possível guardar o tipo de produto.')) }
    finally { setSaving(false) }
  }
  async function toggle(item: ProductType) {
    setSaving(true); setError('')
    try { const updated = await api.updateProductType(householdId, item.id, { name: item.name, categoryId: item.categoryId, subcategoryId: item.subcategoryId || null, isActive: !item.isActive }, token); setItems(current => current.map(value => value.id === updated.id ? updated : value)) }
    catch (reason) { setError(message(reason, `Não foi possível ${item.isActive ? 'desativar' : 'ativar'} este tipo.`)) }
    finally { setSaving(false) }
  }
  return <div className="product-types-settings"><div className="settings-section-toolbar"><div><span className="settings-stat">{items.filter(item => item.isActive).length}</span><span>tipos ativos</span><span className="settings-dot">·</span><span className="settings-stat">{new Set(items.map(item => item.categoryId)).size}</span><span>categorias representadas</span></div><button className="primary-button" onClick={() => { setEditing('new'); setError('') }}><Plus /> Novo tipo</button></div>
    {editing && <ProductTypeEditor item={editing === 'new' ? undefined : editing} categories={categories} saving={saving} error={error} onCancel={() => { setEditing(undefined); setError('') }} onSave={save} />}
    {!editing && error && <div className="form-error">{error}</div>}
    <div className="product-type-toolbar"><label><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar tipos de produto" /></label><button className={showInactive ? 'active' : ''} onClick={() => setShowInactive(value => !value)}><CircleOff /> {showInactive ? 'Ocultar inativos' : 'Mostrar inativos'}</button></div>
    {loading ? <div className="product-types-state"><LoaderCircle className="spin" /> A carregar catálogo…</div> : visible.length ? <div className="product-type-catalog">{visible.map(item => <article className={!item.isActive ? 'inactive' : ''} key={item.id}><span><Package /></span><div><strong>{item.name}</strong><small>{item.categoryName}{item.subcategoryName ? ` · ${item.subcategoryName}` : ''}</small></div><span className={`product-type-status ${item.isActive ? 'active' : ''}`}><i />{item.isActive ? 'Ativo' : 'Inativo'}</span><div className="product-type-actions"><button onClick={() => { setEditing(item); setError('') }}><Pencil /> Editar</button><button className={item.isActive ? 'deactivate' : ''} disabled={saving} onClick={() => toggle(item)}>{item.isActive ? <CircleOff /> : <Check />}{item.isActive ? 'Desativar' : 'Ativar'}</button></div></article>)}</div> : <div className="product-types-state"><Package /> Nenhum tipo de produto encontrado.</div>}
  </div>
}

