// Editor de comidas reutilizable: REGISTRAR un día (lo que comiste) o EDITAR un
// día del plan. La diferencia la pone el padre (meals iniciales, objetivo, dónde
// guarda). Presentación tipo acordeón: cada comida (Desayuno, Cena…) colapsa a
// un resumen y se abre para editar — así no es un formulón de golpe. Se puede
// añadir un alimento NO listado en línea, sin salir del flujo.
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

interface CustomDraft { name: string; kcal: string; p: string; c: string; f: string }
const EMPTY_DRAFT: CustomDraft = { name: '', kcal: '', p: '', c: '', f: '' }

interface Props {
  title: string
  subtitle?: string
  foods: Food[]
  initialMeals: Meal[]
  target: Macro | null
  saving: boolean
  saveLabel?: string
  savedMealIds?: string[]
  onSave?: (meals: Meal[], newFoods: Food[]) => void
  onSaveMeal?: (meal: Meal, newFoods: Food[]) => void
  onCancel: () => void
  onDelete?: () => void
}

export function MealEditor({
  title, subtitle, foods: initialFoods, initialMeals, target, saving, saveLabel, savedMealIds,
  onSave, onSaveMeal, onCancel, onDelete,
}: Props) {
  const [meals, setMeals] = useState<Meal[]>(() => clone(initialMeals))
  // foods locales = DB + alimentos personalizados creados en esta sesión.
  const [foods, setFoods] = useState<Food[]>(initialFoods)
  const newIds = useRef<Set<string>>(new Set())
  // acordeón de una comida abierta a la vez (lista limpia por defecto).
  const [openId, setOpenId] = useState<string | null>(null)
  // alimento personalizado en edición, por comida.
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

  // ── mutaciones (inmutables) ──
  const patchMeals = (fn: (ms: Meal[]) => Meal[]) => setMeals((ms) => fn(clone(ms)))
  const setItemAmount = (mi: number, ii: number, raw: string) =>
    patchMeals((ms) => { ms[mi].items[ii].amount = num(raw); return ms })
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

  // alimento personalizado: se crea como food por unidad (1 porción = sus macros),
  // se guarda en el DB local (reusable) y se añade a la comida. Sin modal.
  const addCustom = (mealId: string) => {
    const name = draft.name.trim()
    if (!name) return
    const id = uid('custom')
    const food: Food = {
      id, name, group: 'other', unit: 'u', per: 1,
      kcal: num(draft.kcal), protein: num(draft.p), carbs: num(draft.c), fat: num(draft.f),
    }
    newIds.current.add(id)
    setFoods((fs) => [...fs, food])
    patchMeals((ms) => {
      const i = ms.findIndex((m) => m.id === mealId)
      if (i >= 0) ms[i].items.push({ foodId: id, amount: 1 })
      return ms
    })
    setCustomFor(null); setDraft(EMPTY_DRAFT)
  }

  const collectNewFoods = (): Food[] => foods.filter((f) => newIds.current.has(f.id))

  const foodOptions = (
    <>
      {grouped.map(({ group, foods: fs }) => (
        <optgroup key={group} label={GROUP_LABEL[group]}>
          {fs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </optgroup>
      ))}
    </>
  )

  return (
    <div className="nt-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onCancel() }}>
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

          {meals.map((m, mi) => {
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
                            onChange={(e) => patchMeals((ms) => { ms[mi].items[ii].foodId = e.target.value; return ms })}
                          >
                            {foodOptions}
                          </select>
                          <div className="nt-amt-wrap">
                            <input
                              className="nt-input amt nt-mono"
                              value={it.amount}
                              inputMode="decimal"
                              onChange={(e) => setItemAmount(mi, ii, e.target.value)}
                            />
                            <span className="unit">{f?.unit === 'u' ? '×' : 'g'}</span>
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
                        {foodOptions}
                      </select>
                    </div>

                    {customFor === m.id ? (
                      <div className="nt-custom">
                        <input
                          className="nt-input"
                          placeholder="Nombre del alimento (no listado)"
                          autoFocus
                          value={draft.name}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') addCustom(m.id) }}
                        />
                        <div className="nt-custom-macros">
                          <input className="nt-input nt-mono" placeholder="kcal" inputMode="decimal" value={draft.kcal} onChange={(e) => setDraft((d) => ({ ...d, kcal: e.target.value }))} />
                          <input className="nt-input nt-mono" placeholder="Prot" inputMode="decimal" value={draft.p} onChange={(e) => setDraft((d) => ({ ...d, p: e.target.value }))} />
                          <input className="nt-input nt-mono" placeholder="Carb" inputMode="decimal" value={draft.c} onChange={(e) => setDraft((d) => ({ ...d, c: e.target.value }))} />
                          <input className="nt-input nt-mono" placeholder="Gras" inputMode="decimal" value={draft.f} onChange={(e) => setDraft((d) => ({ ...d, f: e.target.value }))} />
                        </div>
                        <div className="nt-custom-actions">
                          <span className="nt-custom-hint">1 porción · luego ajusta la cantidad</span>
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
                        <button className="nt-btn sm" onClick={() => onSaveMeal(m, collectNewFoods())} disabled={saving}>
                          {saving ? 'Guardando…' : `Guardar ${m.name || 'comida'}`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

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
