// Editor de comidas reutilizable: REGISTRAR un día (inline, sin modal) o EDITAR
// el plan semanal (sheet/modal). La diferencia la controla el prop `inline`.
// Inline = se incrusta directo en la página, una comida a la vez, guarda por
// separado. Sheet = overlay con cabecera y botón guardar-todo (para el plan).
import { useMemo, useRef, useState } from 'react'
import { Plus, X, Trash2, ChevronRight } from 'lucide-react'
import type { Food, FoodGroup, Meal } from './api'
import { GROUP_LABEL, GROUP_ORDER } from './api'
import {
  foodMap, mealMacro, totalMacro, roundMacro, itemMacro, itemLabel, type Macro,
} from './compute'

let seq = 0
const uid = (p: string): string => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`
const num = (s: string): number => Math.max(0, parseFloat(String(s).replace(',', '.')) || 0)

function clone(meals: Meal[]): Meal[] {
  return meals.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it })) }))
}

// unit: 'g' → macros son por 100g (per=100); 'u' → macros son por 1 porción (per=1)
interface CustomDraft { name: string; kcal: string; p: string; c: string; f: string; unit: 'g' | 'u' }
const EMPTY_DRAFT: CustomDraft = { name: '', kcal: '', p: '', c: '', f: '', unit: 'u' }

interface Props {
  inline?: boolean
  title?: string
  subtitle?: string
  foods: Food[]
  initialMeals: Meal[]
  target: Macro | null
  saving: boolean
  saveLabel?: string
  savedMealIds?: string[]
  onSave?: (meals: Meal[], newFoods: Food[]) => void
  onSaveMeal?: (meal: Meal, newFoods: Food[]) => void
  onCancel?: () => void
  onDelete?: () => void
}

export function MealEditor({
  inline, title, subtitle, foods: initialFoods, initialMeals, target, saving, saveLabel, savedMealIds,
  onSave, onSaveMeal, onCancel, onDelete,
}: Props) {
  const [meals, setMeals] = useState<Meal[]>(() => clone(initialMeals))
  const [foods, setFoods] = useState<Food[]>(initialFoods)
  const newIds = useRef<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [customFor, setCustomFor] = useState<string | null>(null)
  const [draft, setDraft] = useState<CustomDraft>(EMPTY_DRAFT)
  const savedMeals = useMemo(() => new Set(savedMealIds ?? []), [savedMealIds])

  const fm = useMemo(() => foodMap(foods), [foods])
  const grouped = useMemo(() => {
    const by = new Map<FoodGroup, Food[]>()
    for (const f of foods) {
      const arr = by.get(f.group) ?? []
      arr.push(f)
      by.set(f.group, arr)
    }
    return GROUP_ORDER.filter((g) => by.has(g)).map((g) => ({
      group: g,
      foods: (by.get(g) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }))
  }, [foods])

  const total = roundMacro(totalMacro(meals, fm))

  const patchMeals = (fn: (ms: Meal[]) => Meal[]) => setMeals((ms) => fn(clone(ms)))
  const setItemAmount = (mi: number, ii: number, raw: string) =>
    patchMeals((ms) => { ms[mi].items[ii].amount = num(raw); return ms })
  const setItemFood = (mi: number, ii: number, foodId: string) => {
    if (!foodId) return
    const f = fm.get(foodId)
    patchMeals((ms) => {
      ms[mi].items[ii].foodId = foodId
      // reset amount to sensible default for the new food's unit
      ms[mi].items[ii].amount = f?.unit === 'u' ? 1 : 100
      return ms
    })
  }
  const removeItem = (mi: number, ii: number) =>
    patchMeals((ms) => { ms[mi].items.splice(ii, 1); return ms })
  const addItem = (mi: number, foodId: string) => {
    if (!foodId) return
    const f = fm.get(foodId)
    patchMeals((ms) => { ms[mi].items.push({ foodId, amount: f?.unit === 'u' ? 1 : 100 }); return ms })
  }
  const renameMeal = (mi: number, name: string) =>
    patchMeals((ms) => { ms[mi].name = name; return ms })
  const removeMeal = (mi: number) => {
    const id = meals[mi]?.id
    patchMeals((ms) => { ms.splice(mi, 1); return ms })
    if (openId === id) setOpenId(null)
  }
  const addMeal = () => {
    const id = uid('meal')
    patchMeals((ms) => { ms.push({ id, name: `Comida ${ms.length + 1}`, items: [] }); return ms })
    setOpenId(id)
  }

  const addCustom = (mealId: string) => {
    const name = draft.name.trim()
    if (!name) return
    const id = uid('custom')
    const food: Food = {
      id, name, group: 'other',
      unit: draft.unit,
      per: draft.unit === 'g' ? 100 : 1,
      kcal: num(draft.kcal), protein: num(draft.p), carbs: num(draft.c), fat: num(draft.f),
    }
    newIds.current.add(id)
    setFoods((fs) => [...fs, food])
    patchMeals((ms) => {
      const i = ms.findIndex((m) => m.id === mealId)
      if (i >= 0) ms[i].items.push({ foodId: id, amount: draft.unit === 'g' ? 100 : 1 })
      return ms
    })
    setCustomFor(null); setDraft(EMPTY_DRAFT)
  }

  const collectNewFoods = (): Food[] => foods.filter((f) => newIds.current.has(f.id))

  // Genera las opciones del select inline (no variable reutilizada para evitar
  // problemas de reconciliación en múltiples selects simultáneos).
  const makeOptions = () => grouped.map(({ group, foods: fs }) => (
    <optgroup key={group} label={GROUP_LABEL[group]}>
      {fs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </optgroup>
  ))

  // ── render de la sección de una comida (acordeón) ─────────────────────
  const renderMeal = (m: Meal, mi: number) => {
    const mk = roundMacro(mealMacro(m, fm))
    const open = openId === m.id
    const summary = m.items.length
      ? m.items.map((it) => itemLabel(it, fm)).join(' · ')
      : 'vacío — toca para añadir'
    return (
      <div className="nt-ed-meal" key={m.id}>
        <button
          type="button"
          className={`nt-ed-mhead ${open ? 'open' : ''}`}
          onClick={() => setOpenId(open ? null : m.id)}
        >
          <ChevronRight size={16} className="chev" />
          <span className="mc">
            <span className="mtitle">{m.name}</span>
            {!open && <span className="msum">{summary}</span>}
          </span>
          <span className="mk nt-mono">
            {savedMeals.has(m.id) && <span className="saved">guardada</span>}
            {mk.kcal} kcal
          </span>
        </button>

        {open && (
          <div className="nt-ed-mbody">
            <div className="nt-ed-mtop">
              <input
                className="nt-ed-name"
                value={m.name}
                onChange={(e) => renameMeal(mi, e.target.value)}
                placeholder="Nombre de la comida"
              />
              <span className="nt-ed-mk nt-mono">P{mk.protein} · C{mk.carbs} · G{mk.fat}</span>
              <button className="nt-ed-x" onClick={() => removeMeal(mi)} aria-label="quitar comida">
                <Trash2 size={15} />
              </button>
            </div>

            {m.items.map((it, ii) => {
              const f = fm.get(it.foodId)
              const im = roundMacro(itemMacro(it, fm))
              return (
                <div className="nt-row" key={`${m.id}-${ii}`}>
                  <select
                    className="nt-select"
                    value={it.foodId}
                    onChange={(e) => setItemFood(mi, ii, e.target.value)}
                  >
                    {makeOptions()}
                  </select>
                  <div className="nt-amt-wrap">
                    <input
                      className="nt-input amt nt-mono"
                      value={it.amount === 0 ? '' : it.amount}
                      inputMode="decimal"
                      placeholder="0"
                      onChange={(e) => setItemAmount(mi, ii, e.target.value)}
                    />
                    <span className="unit">{f?.unit === 'u' ? 'u' : 'g'}</span>
                  </div>
                  <span className="kc nt-mono">{im.kcal}</span>
                  <button className="nt-ed-x" onClick={() => removeItem(mi, ii)} aria-label="quitar">
                    <X size={15} />
                  </button>
                </div>
              )
            })}

            <div className="nt-additem">
              <select
                className="nt-select"
                value=""
                onChange={(e) => { addItem(mi, e.target.value); e.currentTarget.selectedIndex = 0 }}
              >
                <option value="">+ Añadir alimento de la lista…</option>
                {makeOptions()}
              </select>
            </div>

            {customFor === m.id ? (
              <div className="nt-custom">
                <input
                  className="nt-input"
                  placeholder="Nombre del alimento"
                  autoFocus
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') addCustom(m.id) }}
                />
                <div className="nt-unit-toggle">
                  <button
                    type="button"
                    className={`nt-utog ${draft.unit === 'u' ? 'sel' : ''}`}
                    onClick={() => setDraft((d) => ({ ...d, unit: 'u' }))}
                  >
                    por unidad
                  </button>
                  <button
                    type="button"
                    className={`nt-utog ${draft.unit === 'g' ? 'sel' : ''}`}
                    onClick={() => setDraft((d) => ({ ...d, unit: 'g' }))}
                  >
                    en gramos (por 100 g)
                  </button>
                </div>
                <div className="nt-custom-macros">
                  <div className="nt-custom-field">
                    <label>kcal</label>
                    <input className="nt-input nt-mono" inputMode="decimal" value={draft.kcal} onChange={(e) => setDraft((d) => ({ ...d, kcal: e.target.value }))} />
                  </div>
                  <div className="nt-custom-field">
                    <label>Prot g</label>
                    <input className="nt-input nt-mono" inputMode="decimal" value={draft.p} onChange={(e) => setDraft((d) => ({ ...d, p: e.target.value }))} />
                  </div>
                  <div className="nt-custom-field">
                    <label>Carb g</label>
                    <input className="nt-input nt-mono" inputMode="decimal" value={draft.c} onChange={(e) => setDraft((d) => ({ ...d, c: e.target.value }))} />
                  </div>
                  <div className="nt-custom-field">
                    <label>Gras g</label>
                    <input className="nt-input nt-mono" inputMode="decimal" value={draft.f} onChange={(e) => setDraft((d) => ({ ...d, f: e.target.value }))} />
                  </div>
                </div>
                <p className="nt-custom-hint">
                  {draft.unit === 'g'
                    ? 'Introduce los macros por 100 g — luego ajusta la cantidad en gramos.'
                    : '1 porción = los macros que pongas — luego multiplica por número de porciones.'}
                </p>
                <div className="nt-custom-actions">
                  <button className="nt-btn ghost sm" onClick={() => { setCustomFor(null); setDraft(EMPTY_DRAFT) }}>Cancelar</button>
                  <button className="nt-btn sm" onClick={() => addCustom(m.id)} disabled={!draft.name.trim()}>Añadir</button>
                </div>
              </div>
            ) : (
              <button className="nt-btn ghost sm nt-otro" onClick={() => { setCustomFor(m.id); setDraft(EMPTY_DRAFT) }}>
                <Plus size={14} /> Otro alimento (no listado)
              </button>
            )}

            {onSaveMeal && (
              <div className="nt-meal-save">
                <span>{savedMeals.has(m.id) ? 'Actualiza sólo esta comida.' : 'Guarda sólo esta comida.'}</span>
                <button
                  className="nt-btn sm"
                  onClick={() => { onSaveMeal(m, collectNewFoods()); if (inline) setOpenId(null) }}
                  disabled={saving}
                >
                  {saving ? 'Guardando…' : `Guardar ${m.name || 'comida'}`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Modo inline: se incrusta en la página, sin overlay ────────────────
  if (inline) {
    return (
      <div className="nt-inline-log">
        <div className="nt-inline-totals">
          <span className="nt-mono">
            <b className="nt-total-v">{total.kcal}</b>
            <span className="nt-total-u">kcal{target ? ` · / ${Math.round(target.kcal)} obj` : ''}</span>
          </span>
          <div className="nt-chips">
            <span className="nt-chip p nt-mono">P {total.protein}{target ? `/${Math.round(target.protein)}` : ''}</span>
            <span className="nt-chip c nt-mono">C {total.carbs}{target ? `/${Math.round(target.carbs)}` : ''}</span>
            <span className="nt-chip f nt-mono">G {total.fat}{target ? `/${Math.round(target.fat)}` : ''}</span>
          </div>
        </div>

        {meals.length === 0 && (
          <div className="nt-empty" style={{ border: '1px dashed var(--nt-line2)' }}>
            <b>Sin comidas</b>
            Añade una comida para empezar.
          </div>
        )}

        {meals.map((m, mi) => renderMeal(m, mi))}

        <button className="nt-btn ghost sm" onClick={addMeal} style={{ marginTop: 4 }}>
          <Plus size={15} /> Agregar comida
        </button>

        {onDelete && (
          <div className="nt-inline-delete">
            <button className="nt-btn danger sm" onClick={onDelete} disabled={saving}>
              <Trash2 size={14} /> Eliminar registro del día
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Modo sheet: overlay + panel flotante (para editar el plan semanal) ─
  return (
    <div className="nt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onCancel?.() }}>
      <div className="nt-sheet" role="dialog" aria-modal="true">
        <div className="nt-sheet-head">
          <div>
            <div className="ti">{title}</div>
            {subtitle && <div className="su">{subtitle}</div>}
          </div>
          <button className="nt-close" onClick={onCancel} aria-label="cerrar" disabled={saving}>
            <X size={16} />
          </button>
        </div>

        <div className="nt-sheet-body">
          {meals.length === 0 && (
            <div className="nt-empty" style={{ border: '1px dashed var(--nt-line2)' }}>
              <b>Sin comidas</b>
              Añade una comida para empezar.
            </div>
          )}

          {meals.map((m, mi) => renderMeal(m, mi))}

          <button className="nt-btn ghost sm" onClick={addMeal} style={{ marginTop: 4 }}>
            <Plus size={15} /> Agregar comida
          </button>
        </div>

        <div className="nt-sheet-foot">
          <div className="nt-ed-total">
            <div className="kctot nt-mono">{total.kcal}<span className="u">kcal</span></div>
            {target && <span className="vs nt-mono">/ {Math.round(target.kcal)} objetivo</span>}
            <div className="nt-chips" style={{ marginLeft: 'auto' }}>
              <span className="nt-chip p nt-mono">P {total.protein}{target ? `/${Math.round(target.protein)}` : ''}</span>
              <span className="nt-chip c nt-mono">C {total.carbs}{target ? `/${Math.round(target.carbs)}` : ''}</span>
              <span className="nt-chip f nt-mono">G {total.fat}{target ? `/${Math.round(target.fat)}` : ''}</span>
            </div>
          </div>
          <div className="nt-foot-row">
            <div>
              {onDelete && (
                <button className="nt-btn danger sm" onClick={onDelete} disabled={saving}>
                  <Trash2 size={14} /> Borrar registro
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="nt-btn ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
              {onSave && (
                <button className="nt-btn" onClick={() => onSave(meals, collectNewFoods())} disabled={saving}>
                  {saving ? 'Guardando…' : saveLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
