import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Utensils, Plus, CalendarDays, Flame, ChevronRight,
} from 'lucide-react'
import type { FeatureDescriptor } from '../types'
import './nutrition.css'
import { nt, type NutritionStore, type PlanDay, type Meal, type Food } from './api'
import { SEED_FOODS, SEED_PLAN } from './seed'
import {
  foodMap, totalMacro, roundMacro,
  todayIso, dowOf, dowLong, dowShort, ddmon, lastNDays, parseIso, pct,
  ZERO, type Macro,
} from './compute'
import { MealEditor } from './MealEditor'

type Status = 'loading' | 'error' | 'ready'
type Editor = { kind: 'plan'; dayId: string } | null

// ── sub-componentes de presentación ───────────────────────────────────────
function KcalRing({ value, target }: { value: number; target: number }) {
  const r = 60
  const C = 2 * Math.PI * r
  const frac = target > 0 ? Math.min(1.2, value / target) : 0
  const offset = C * (1 - Math.min(1, frac))
  const remaining = Math.round(target - value)
  const over = value > target && target > 0
  return (
    <div className="nt-ring">
      <svg width="138" height="138" viewBox="0 0 138 138">
        <circle className="nt-ring-track" cx="69" cy="69" r={r} fill="none" strokeWidth="12" />
        <circle
          className="nt-ring-fill" cx="69" cy="69" r={r} fill="none" strokeWidth="12"
          strokeDasharray={C} strokeDashoffset={offset}
          style={over ? { stroke: 'var(--nt-f)' } : undefined}
        />
      </svg>
      <div className="nt-ring-c">
        <span className="v nt-mono">{Math.round(value)}</span>
        <span className="u">/ {Math.round(target)} kcal</span>
        <span className="t">{remaining >= 0 ? `${remaining} restantes` : `${Math.abs(remaining)} de más`}</span>
      </div>
    </div>
  )
}

function MacroBars({ consumed, target }: { consumed: Macro; target: Macro }) {
  const rows = [
    { k: 'p', label: 'Proteína', v: consumed.protein, t: target.protein },
    { k: 'c', label: 'Carbos', v: consumed.carbs, t: target.carbs },
    { k: 'f', label: 'Grasa', v: consumed.fat, t: target.fat },
  ]
  return (
    <div className="nt-macros">
      {rows.map((r) => {
        const p = pct(r.v, r.t)
        return (
          <div className={`nt-macro m-${r.k}`} key={r.k}>
            <span className="lab"><i className="dot" /> {r.label}</span>
            <div className="track">
              <div className={`fill ${r.v > r.t && r.t > 0 ? 'over' : ''}`} style={{ width: `${Math.min(100, p)}%` }} />
            </div>
            <span className="val nt-mono"><b>{Math.round(r.v)}</b> / {Math.round(r.t)} g</span>
          </div>
        )
      })}
    </div>
  )
}

function mergeMealTemplates(planMeals: Meal[], loggedMeals: Meal[]): Meal[] {
  const loggedById = new Map(loggedMeals.map((meal) => [meal.id, meal]))
  const merged = planMeals.map((meal) => loggedById.get(meal.id) ?? meal)
  for (const meal of loggedMeals) {
    if (!planMeals.some((planMeal) => planMeal.id === meal.id)) merged.push(meal)
  }
  return merged
}

// ── página ─────────────────────────────────────────────────────────────────
function NutritionPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [store, setStore] = useState<NutritionStore | null>(null)
  const [selDay, setSelDay] = useState<string>(todayIso())
  const [editor, setEditor] = useState<Editor>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await nt.get()
    if (!r.ok || !r.data) { setStatus('error'); return }
    let s = r.data
    // Sembrado idempotente la primera vez (la dieta como datos, no hardcode).
    if (!s.seeded || s.plan.days.length === 0) {
      const sd = await nt.seed(SEED_FOODS, SEED_PLAN)
      if (sd.ok && sd.data) s = sd.data
    }
    setStore(s)
    setStatus('ready')
  }, [])

  useEffect(() => { void load() }, [load])

  const fm = useMemo(() => foodMap(store?.foods ?? []), [store])
  const planByDow = useMemo(() => {
    const m = new Map<number, PlanDay>()
    for (const d of store?.plan.days ?? []) m.set(d.dow, d)
    return m
  }, [store])

  const today = todayIso()
  const targetOf = useCallback((date: string): Macro => {
    const d = planByDow.get(dowOf(date))
    return d ? totalMacro(d.meals, fm) : { ...ZERO }
  }, [planByDow, fm])
  const planDayOf = (date: string): PlanDay | null => planByDow.get(dowOf(date)) ?? null

  // ── acciones ──
  const saveLogMeal = async (date: string, meal: Meal, newFoods: Food[]) => {
    setBusy(true)
    const currentMeals = store?.logs[date]?.meals ?? []
    const withoutMeal = currentMeals.filter((m) => m.id !== meal.id)
    const meals = meal.items.length > 0 ? [...withoutMeal, meal] : withoutMeal
    const r = meals.length > 0
      ? await nt.logDay({ date, meals, foods: newFoods })
      : await nt.deleteLog(date)
    if (r.ok && r.data) setStore(r.data)
    setBusy(false)
  }
  const savePlanDay = async (dayId: string, meals: Meal[], newFoods: Food[]) => {
    const day = store?.plan.days.find((d) => d.id === dayId)
    if (!day) { setEditor(null); return }
    setBusy(true)
    const r = await nt.savePlanDay({ ...day, meals, foods: newFoods })
    if (r.ok && r.data) setStore(r.data)
    setBusy(false); setEditor(null)
  }
  const deleteLog = async (date: string) => {
    setBusy(true)
    const r = await nt.deleteLog(date)
    if (r.ok && r.data) setStore(r.data)
    setBusy(false); setEditor(null)
  }

  // ── estados de carga / error ──
  if (status === 'loading') {
    return (
      <div className="nt-root"><div className="nt-wrap">
        <span className="nt-kicker"><Utensils size={13} /> Nutrición</span>
        <h1 className="nt-title">Comidas<br />&amp; macros</h1>
        <p className="nt-sub">Cargando tu plan…</p>
      </div></div>
    )
  }
  if (status === 'error' || !store) {
    return (
      <div className="nt-root"><div className="nt-wrap">
        <span className="nt-kicker"><Utensils size={13} /> Nutrición</span>
        <h1 className="nt-title">Comidas<br />&amp; macros</h1>
        <div className="nt-card nt-pad nt-empty" style={{ marginTop: 20 }}>
          <b>No se pudo cargar</b>
          Cierra la app por completo (Cmd+Q) y vuelve a abrirla para activar el módulo.
          <div style={{ marginTop: 14 }}><button className="nt-btn" onClick={() => { setStatus('loading'); void load() }}>Reintentar</button></div>
        </div>
      </div></div>
    )
  }

  // ── datos derivados ──
  const todayLog = store.logs[today]
  const todayTarget = targetOf(today)
  const todayConsumed = todayLog ? totalMacro(todayLog.meals, fm) : { ...ZERO }

  const days30 = lastNDays(30)
  const loggedCount = days30.filter((d) => store.logs[d]).length
  // racha: días consecutivos con registro terminando hoy (o ayer si hoy aún no)
  let streak = 0
  {
    const start = store.logs[today] ? 0 : 1
    for (let i = start; i < 90; i++) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (store.logs[iso]) streak++
      else break
    }
  }
  const planDays = store.plan.days
  const planAvg = planDays.length
    ? planDays.reduce((acc, d) => {
        const m = totalMacro(d.meals, fm)
        return { kcal: acc.kcal + m.kcal, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }
      }, { ...ZERO })
    : { ...ZERO }
  const n = Math.max(1, planDays.length)

  // breakdown del día seleccionado
  const selLog = store.logs[selDay]
  const selTarget = targetOf(selDay)
  const selPlan = planDayOf(selDay)
  const selConsumed = selLog ? totalMacro(selLog.meals, fm) : { ...ZERO }

  // editor de plan semanal (sheet/modal — sólo para editar la plantilla)
  let editorNode: React.ReactNode = null
  if (editor?.kind === 'plan') {
    const day = store.plan.days.find((d) => d.id === editor.dayId)
    if (day) {
      editorNode = (
        <MealEditor
          title={`Editar plan · ${day.name}`}
          subtitle={`${day.focus} — esto es tu objetivo para los ${day.name.toLowerCase()}`}
          foods={store.foods}
          initialMeals={day.meals}
          target={null}
          saving={busy}
          saveLabel="Guardar plan"
          onSave={(meals, newFoods) => void savePlanDay(day.id, meals, newFoods)}
          onCancel={() => setEditor(null)}
        />
      )
    }
  }

  return (
    <div className="nt-root">
      <div className="nt-wrap">
        <header className="nt-headrow nt-reveal">
          <div>
            <span className="nt-kicker"><Utensils size={13} /> Nutrición</span>
            <h1 className="nt-title">Comidas<br />&amp; macros</h1>
            <p className="nt-sub">Tu plan periodizado es el objetivo diario · registra lo que comes</p>
          </div>
          <button className="nt-btn" onClick={() => {
            setSelDay(today)
            setTimeout(() => document.getElementById('nt-detalle')?.scrollIntoView({ behavior: 'smooth' }), 50)
          }}>
            <Plus size={17} /> Hoy
          </button>
        </header>

        {/* HERO — hoy */}
        <section className="nt-card nt-pad nt-reveal" style={{ marginTop: 22, animationDelay: '40ms' }}>
          <div className="nt-hero">
            <KcalRing value={todayConsumed.kcal} target={todayTarget.kcal} />
            <div style={{ minWidth: 0 }}>
              <div className="nt-bd-date" style={{ marginBottom: 14 }}>
                <span className="d">Hoy · {dowLong(today)}</span>
                {planDayOf(today) && <span className="f">{planDayOf(today)!.focus}</span>}
              </div>
              <MacroBars consumed={todayConsumed} target={todayTarget} />
              {!todayLog && (
                <p className="nt-sub" style={{ marginTop: 14 }}>
                  Aún no registras hoy — el objetivo viene de tu plan de {dowLong(today).toLowerCase()}.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* STATS */}
        <div className="nt-stats">
          {[
            { t: 'Registrados', v: loggedCount, u: '/30d', s: 'días con comida logueada' },
            { t: 'Racha', v: streak, u: streak === 1 ? 'día' : 'días', s: 'consecutivos registrando' },
            { t: 'Prom. plan', v: Math.round(planAvg.kcal / n), u: 'kcal', s: 'objetivo medio diario' },
            { t: 'Prom. proteína', v: Math.round(planAvg.protein / n), u: 'g', s: 'objetivo medio diario' },
          ].map((c, i) => (
            <div className="nt-card nt-chrome nt-stat nt-reveal" key={c.t} style={{ animationDelay: `${80 + i * 50}ms` }}>
              <div className="t">{c.t}</div>
              <div className="v nt-mono">{c.v}<span className="u">{c.u}</span></div>
              <div className="s">{c.s}</div>
            </div>
          ))}
        </div>

        {/* CALENDARIO 30 días */}
        <section className="nt-sec">
          <div className="nt-h2">
            <CalendarDays size={17} /><b>Actividad — 30 días</b><span className="ln" />
            <span className="tag">{loggedCount} registrados</span>
          </div>
          <div className="nt-cal-grid">
            {days30.map((iso, i) => {
              const logged = !!store.logs[iso]
              const d = parseIso(iso)
              return (
                <button
                  key={iso}
                  className={`nt-day-cell ${logged ? 'logged' : ''} ${iso === selDay ? 'sel' : ''} ${iso === today ? 'today' : ''}`}
                  style={{ animationDelay: `${i * 16}ms` }}
                  onClick={() => setSelDay(iso)}
                  title={`${dowLong(iso)} ${ddmon(iso)}${logged ? ' · registrado' : ''}`}
                >
                  {logged && <span className="badge" />}
                  <span className="dn nt-mono">{d.getDate()}</span>
                  <span className="dw">{dowShort(iso)}</span>
                </button>
              )
            })}
          </div>
          <div className="nt-cal-legend">
            <span><i className="lg" /> registrado</span>
            <span><i className="td" /> hoy</span>
            <span style={{ color: 'var(--nt-faint)' }}>toca un día para ver / registrar</span>
          </div>
        </section>

        {/* BREAKDOWN del día seleccionado — inline editor, sin modal */}
        <section className="nt-sec" id="nt-detalle">
          <div className="nt-h2"><Flame size={17} /><b>Detalle del día</b><span className="ln" />
            {!selLog && <span className="tag">sin registro · el plan es el punto de partida</span>}
          </div>
          <div className="nt-card nt-pad">
            <div className="nt-bd-head">
              <div className="nt-bd-date">
                <span className="d">{ddmon(selDay)}</span>
                <span style={{ color: 'var(--nt-mut)', fontSize: 13 }}>{dowLong(selDay)}</span>
                {selPlan && <span className="f">{selPlan.focus}</span>}
              </div>
            </div>
            <MealEditor
              inline
              key={selDay}
              foods={store.foods}
              initialMeals={mergeMealTemplates(selPlan?.meals ?? [], selLog?.meals ?? [])}
              target={selTarget}
              saving={busy}
              savedMealIds={(selLog?.meals ?? []).map((m) => m.id)}
              onSaveMeal={(meal, newFoods) => void saveLogMeal(selDay, meal, newFoods)}
              onDelete={selLog ? () => void deleteLog(selDay) : undefined}
            />
          </div>
        </section>

        {/* PLAN SEMANAL (editable) */}
        <section className="nt-sec">
          <div className="nt-h2"><Utensils size={17} /><b>Plan semanal</b><span className="ln" />
            <span className="tag">toca un día para editarlo</span></div>
          <div className="nt-plan">
            {planDays.map((d) => {
              const m = roundMacro(totalMacro(d.meals, fm))
              const isToday = d.dow === dowOf(today)
              return (
                <button key={d.id} className={`nt-card nt-pday ${isToday ? 'is-today' : ''}`} onClick={() => setEditor({ kind: 'plan', dayId: d.id })}>
                  <div className="nt-pday-h">
                    <span className="dn">{d.name}</span>
                    {isToday && <span className="badge">hoy</span>}
                  </div>
                  <div className="focus">{d.focus}</div>
                  <div className="nt-pday-kcal nt-mono">{m.kcal}<span className="u">kcal</span></div>
                  <div className="nt-pminis">
                    <div className="nt-pmini p"><div className="pv nt-mono">{m.protein}</div><div className="pl">Prot</div></div>
                    <div className="nt-pmini c"><div className="pv nt-mono">{m.carbs}</div><div className="pl">Carb</div></div>
                    <div className="nt-pmini f"><div className="pv nt-mono">{m.fat}</div><div className="pl">Gras</div></div>
                  </div>
                  <div className="nt-pmeals">{d.meals.length} comidas <ChevronRight size={13} /></div>
                </button>
              )
            })}
          </div>
        </section>

        <div className="nt-foot">
          <span className="dot" /> NUTRICIÓN · datos locales · {loggedCount} días registrados · plan editable
        </div>
      </div>

      {editorNode}
    </div>
  )
}

export const feature: FeatureDescriptor = {
  id: 'nutrition',
  label: 'Nutrición',
  icon: Utensils,
  Component: NutritionPage,
}
