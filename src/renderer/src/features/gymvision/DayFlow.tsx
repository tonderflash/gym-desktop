// Flujo de día: al tocar un día del calendario, precarga lo que se entrenó
// según Hevy y deja asignar un video a cada serie logueada. Luego corre el
// pipeline por video (seed → analyze) y verifica reps detectadas vs logueadas
// con un check animado por miniatura.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Cpu, Film, Play, Plus, RefreshCw, X } from 'lucide-react'
import { SeedMarker } from './SeedMarker'
import {
  gv, type Exercise, type HevyDay, type HevyDayExercise, type HevyDaySet,
  type HevyLink, type SessionDetail, type SessionRow,
} from './api'

// 'summary' es el aterrizaje cuando el día ya tiene sesiones: desglose general
// del día (todas las series con sus métricas). 'pick' queda como paso de
// "agregar videos" — no vuelve a aparecer solo porque abras el día.
type Phase = 'load' | 'summary' | 'pick' | 'seed' | 'analyze' | 'done'

/** Pesos de Hevy = floats de conversión lb→kg — presentar a 0.5kg. */
const kg = (w: number) => Math.round(w * 2) / 2

/** Video asignado a una serie de Hevy (antes de crear la sesión). */
interface Assignment {
  set: HevyDaySet
  videoPath: string
  videoName: string
}

/** Serie ya convertida en sesión, avanzando por el pipeline. */
interface Item {
  set: HevyDaySet
  session: SessionDetail
  status: 'waiting' | 'processing' | 'ok' | 'mismatch' | 'error'
  detected: number | null
  error?: string
}

/** Check SVG dibujado con stroke-dashoffset — se monta cuando el análisis
 *  confirma que las reps cuadran, con delay para el stagger. */
function AnimatedCheck({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <svg className="gv-ck" viewBox="0 0 52 52" style={{ animationDelay: `${delayMs}ms` }}>
      <circle className="gv-ck-c" cx="26" cy="26" r="23" style={{ animationDelay: `${delayMs}ms` }} />
      <path className="gv-ck-p" d="M14 27l8 8 16-17" style={{ animationDelay: `${delayMs + 220}ms` }} />
    </svg>
  )
}

function setLabel(s: HevyDaySet): string {
  const w = s.weight_kg != null ? `${kg(s.weight_kg)}kg` : '—'
  const r = s.reps != null ? `× ${s.reps}` : ''
  const rpe = s.rpe != null ? ` @${s.rpe}` : ''
  return `${w} ${r}${rpe}`
}

/** Reconstruye la "serie de Hevy" desde el enlace guardado en la sesión —
 *  para reanudar un pipeline sin depender del fetch del día. */
function setFromLink(link: HevyLink, sessionId: number, analyzed: boolean): HevyDaySet {
  return {
    id: link.set_id,
    index: link.set_number - 1,
    number: link.set_number,
    type: link.set_type,
    weight_kg: link.weight_kg,
    reps: link.reps,
    rpe: link.rpe,
    session_id: sessionId,
    session_analyzed: analyzed,
  }
}

export function DayFlow({ date, sessions, autoResume, onClose, onOpenSession, onManualEntry, onComplete }: {
  date: string
  sessions: SessionRow[] // sesiones VBT ya existentes ese día
  autoResume?: boolean   // abierto desde "Homologación pendiente" → reanudar directo
  onClose: () => void
  onOpenSession: (id: number) => void
  onManualEntry: () => void
  onComplete: () => void
}) {
  const [phase, setPhase] = useState<Phase>('load')
  const [day, setDay] = useState<HevyDay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // selección
  const [exerciseId, setExerciseId] = useState<number | null>(null)
  const [manualSlug, setManualSlug] = useState('') // para ejercicios sin mapear
  const [catalog, setCatalog] = useState<Exercise[]>([])
  const [assignments, setAssignments] = useState<Map<number, Assignment>>(new Map())
  // Solo barra por defecto: con barbell la pose glitchea por oclusión (los
  // discos tapan cadera/rodilla) y no aporta al VBT — la velocidad sale del
  // tracking del disco. La pose queda como opt-in experimental.
  const [pose, setPose] = useState('')
  const [plate, setPlate] = useState('0.45')
  // pipeline
  const [items, setItems] = useState<Item[]>([])
  const [seedIdx, setSeedIdx] = useState(0)

  const load = async (refresh?: boolean, landing?: 'summary' | 'pick') => {
    setError(null)
    const r = await gv.hevyDay(date, refresh)
    if (!r.ok || !r.data) {
      setError(r.error === 'offline' ? 'GymVision no responde.' : (r.error ?? 'Error al cargar el día'))
      setDay(null)
    } else {
      setDay(r.data)
      if (r.data.sync_error) setError(`Hevy: ${r.data.sync_error} (mostrando datos locales)`)
    }
    // Con sesiones registradas se aterriza en el resumen del día; la selección
    // de ejercicio/series es solo para AGREGAR videos.
    setPhase(landing ?? (sessions.length > 0 ? 'summary' : 'pick'))
  }

  useEffect(() => { void load() }, [date]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void gv.exercises().then((r) => setCatalog(r.data ?? [])) }, [])

  // ── guarda de proceso ─────────────────────────────────────────────────
  // Mientras hay pipeline vivo (subiendo, marcando o analizando): el main pide
  // confirmación al cerrar la ventana, y beforeunload bloquea recargas (Cmd+R).
  const working = busy || phase === 'seed' || phase === 'analyze'
  useEffect(() => {
    if (working) {
      const reason = phase === 'analyze'
        ? `Analizando ${items.length} serie(s) del ${date}`
        : phase === 'seed'
          ? `Marcando la barra (${items.length} video(s)) del ${date}`
          : `Subiendo videos del ${date}`
      void gv.setBusy(reason)
      window.onbeforeunload = (e) => { e.preventDefault(); return '' }
    } else {
      void gv.setBusy(null)
      window.onbeforeunload = null
    }
    return () => { window.onbeforeunload = null; void gv.setBusy(null) }
  }, [working, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── reanudación ───────────────────────────────────────────────────────
  // Fuente de verdad: el servidor. Una sesión "a medias" = tiene serie de Hevy
  // pero 0 reps analizadas (la app se cerró antes de terminar el pipeline).
  const resumable = useMemo(
    () => sessions
      .filter((s) => s.hevy && s.summary.rep_count === 0)
      .sort((a, b) => (a.hevy!.set_number - b.hevy!.set_number)),
    [sessions],
  )

  const resumePipeline = async () => {
    if (busy || resumable.length === 0) return
    setBusy(true)
    setError(null)
    const rebuilt: Item[] = []
    for (const row of resumable) {
      const r = await gv.session(row.id)
      if (!r.ok || !r.data || !r.data.hevy) {
        setError(`No pude recargar la sesión ${row.id} — ¿GymVision está corriendo?`)
        setBusy(false)
        return
      }
      const d = r.data
      rebuilt.push({
        set: setFromLink(d.hevy!, d.id, d.analyzed),
        session: d,
        // si el server alcanzó a terminar el análisis tras el cierre, ya está
        status: d.analyzed ? (d.hevy!.rep_match?.ok ? 'ok' : 'mismatch') : 'waiting',
        detected: d.hevy!.rep_match?.detected ?? null,
      })
    }
    setBusy(false)
    setItems(rebuilt)
    const firstUnseeded = rebuilt.findIndex((it) => it.status === 'waiting' && !it.session.bar_seed)
    if (firstUnseeded >= 0) {
      setSeedIdx(firstUnseeded)
      setPhase('seed')
    } else if (rebuilt.some((it) => it.status === 'waiting')) {
      setPhase('analyze')
      void analyzeAll(rebuilt)
    } else {
      setPhase('done') // todo terminó server-side: solo mostrar la verificación
    }
  }

  // ── drift de pesos vs Hevy ────────────────────────────────────────────
  // El fetch del día trae los pesos FRESCOS de Hevy (auto-sync server-side);
  // si difieren de lo que guardó la sesión, se corrigió en Hevy después de
  // registrar el video → remediable en bloque sin re-analizar.
  const drifted = useMemo(() => {
    const byId = new Map(sessions.map((s) => [s.id, s]))
    const out: { sessionId: number; setNumber: number; from: number; to: number }[] = []
    for (const w of day?.workouts ?? []) {
      for (const ex of w.exercises) {
        for (const st of ex.sets) {
          if (st.session_id == null || st.weight_kg == null) continue
          const row = byId.get(st.session_id)
          if (row && Math.abs(row.weight_kg - st.weight_kg) > 0.01) {
            out.push({ sessionId: st.session_id, setNumber: st.number,
              from: row.weight_kg, to: st.weight_kg })
          }
        }
      }
    }
    return out
  }, [day, sessions])

  const [fixingDrift, setFixingDrift] = useState(false)
  const fixDrift = async () => {
    if (fixingDrift) return
    setFixingDrift(true)
    setError(null)
    for (const d of drifted) {
      const r = await gv.updateWeight(d.sessionId, { from_hevy: true })
      if (!r.ok) {
        setError(`Set ${d.setNumber}: ${r.error === 'offline' ? 'GymVision no responde' : r.error ?? 'no se pudo corregir'}`)
        break
      }
    }
    setFixingDrift(false)
    onComplete() // recarga sesiones en el padre → el aviso desaparece solo
  }

  // ── resumen del día: sesiones agrupadas por ejercicio ─────────────────
  const groups = useMemo(() => {
    const byEx = new Map<string, SessionRow[]>()
    for (const s of sessions) {
      const arr = byEx.get(s.exercise) ?? []
      arr.push(s)
      byEx.set(s.exercise, arr)
    }
    return [...byEx.entries()].map(([name, rows]) => {
      rows.sort((a, b) => (a.hevy?.set_number ?? a.id) - (b.hevy?.set_number ?? b.id))
      const vels = rows.map((r) => r.summary.mean_velocity)
        .filter((v): v is number => v != null)
      const first = vels[0]
      const last = vels[vels.length - 1]
      return {
        name,
        rows,
        totalReps: rows.reduce((n, r) => n + r.summary.rep_count, 0),
        bestV: vels.length ? Math.max(...rows.map((r) => r.summary.best_velocity ?? 0)) : null,
        best1rm: Math.max(0, ...rows.map((r) => r.summary.best_1rm ?? 0)) || null,
        verified: rows.filter((r) => r.hevy?.rep_match?.ok).length,
        withHevy: rows.filter((r) => r.hevy).length,
        // fatiga inter-serie: caída de la velocidad media del primer al último set
        interSetLoss: (vels.length >= 2 && first)
          ? Math.round((1 - last / first) * 1000) / 10
          : null,
      }
    })
  }, [sessions])

  // Abierto desde el banner "Homologación pendiente" → reanudar sin más clicks.
  const autoResumed = useRef(false)
  useEffect(() => {
    if (autoResume && !autoResumed.current && resumable.length > 0) {
      autoResumed.current = true
      void resumePipeline()
    }
  }, [autoResume, resumable]) // eslint-disable-line react-hooks/exhaustive-deps

  const allExercises: HevyDayExercise[] = useMemo(
    () => (day?.workouts ?? []).flatMap((w) => w.exercises),
    [day],
  )
  const selected = allExercises.find((e) => e.id === exerciseId) ?? null
  const effectiveSlug = selected?.exercise_slug ?? manualSlug

  const pickVideoFor = async (set: HevyDaySet) => {
    const r = await gv.pickVideo()
    if (!r.ok || !r.data) return
    setAssignments((prev) => {
      const next = new Map(prev)
      next.set(set.id, { set, videoPath: r.data!.path, videoName: r.data!.name })
      return next
    })
  }

  const unassign = (setId: number) => {
    setAssignments((prev) => {
      const next = new Map(prev)
      next.delete(setId)
      return next
    })
  }

  const assigned = selected ? selected.sets.filter((s) => assignments.has(s.id)) : []
  const canCreate = assigned.length > 0 && !!effectiveSlug && !busy

  // Crea una sesión por video asignado (secuencial: el server copia archivos).
  const createAll = async () => {
    if (!selected || !effectiveSlug) return
    setBusy(true)
    setError(null)
    const created: Item[] = []
    for (const s of assigned) {
      const a = assignments.get(s.id)!
      const r = await gv.createSession({
        exercise: effectiveSlug,
        date,
        pose_engine: pose,
        video_path: a.videoPath,
        plate_diameter_m: Number(plate) || undefined,
        hevy_set_id: s.id,
        // weight_kg lo precarga el server desde la serie de Hevy
        ...(s.weight_kg == null ? { weight_kg: 0 } : {}),
      })
      if (!r.ok || !r.data) {
        setError(`Set ${s.number}: ${r.error === 'offline' ? 'GymVision no responde' : r.error ?? 'error al crear'}`)
        setBusy(false)
        // deja los ya creados en el pipeline para no perderlos
        if (created.length) { setItems(created); setSeedIdx(0); setPhase('seed') }
        return
      }
      created.push({ set: s, session: r.data, status: 'waiting', detected: null })
    }
    setBusy(false)
    setItems(created)
    setSeedIdx(0)
    setPhase('seed')
  }

  // ── seed secuencial ───────────────────────────────────────────────────
  const [seedBox, setSeedBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const nextSeed = async () => {
    const item = items[seedIdx]
    if (item && seedBox) await gv.saveSeed(item.session.id, seedBox)
    setSeedBox(null)
    if (seedIdx + 1 < items.length) {
      setSeedIdx(seedIdx + 1)
    } else {
      setPhase('analyze')
      void analyzeAll(items)
    }
  }

  // ── análisis secuencial con verificación ─────────────────────────────
  // Recibe la lista explícita (no lee el state) para poder llamarse justo
  // después de setItems sin closures viejos. Salta lo ya analizado (resume).
  const analyzeAll = async (list: Item[]) => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].status !== 'waiting') continue
      setItems((prev) => prev.map((it, j) => (j === i ? { ...it, status: 'processing' } : it)))
      const r = await gv.analyze(list[i].session.id)
      setItems((prev) => prev.map((it, j) => {
        if (j !== i) return it
        if (!r.ok || !r.data) {
          return { ...it, status: 'error', error: r.error === 'offline' ? 'análisis colgado o server caído' : r.error }
        }
        const detected = r.data.hevy?.rep_match?.detected ?? r.data.reps.length
        const ok = r.data.hevy?.rep_match?.ok ?? false
        return { ...it, session: r.data, detected, status: ok ? 'ok' : 'mismatch' }
      }))
    }
    setPhase('done')
  }

  const okCount = items.filter((i) => i.status === 'ok').length

  // ── render ────────────────────────────────────────────────────────────
  const title =
    phase === 'seed' ? `Marcar la barra · video ${seedIdx + 1}/${items.length}`
      : phase === 'analyze' ? 'Analizando series'
        : phase === 'done' ? 'Verificación'
          : phase === 'pick' ? `Agregar videos · ${date}`
            : `Día ${date}`

  return (
    <div className="gv-overlay" onMouseDown={(e) => {
      if (e.target === e.currentTarget && phase !== 'analyze') onClose()
    }}>
      <div className="gv-sheet" role="dialog" aria-modal="true">
        <div className="gv-sheet-head">
          <b>{title}</b>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {(phase === 'pick' || phase === 'summary') && (
              <button className="gv-btn gv-day-sync"
                onClick={() => { const back = phase as 'pick' | 'summary'; setPhase('load'); void load(true, back) }}
                title="Re-sincronizar con Hevy">
                <RefreshCw size={13} /> sync
              </button>
            )}
            {phase !== 'analyze' && <button className="gv-close" onClick={onClose} aria-label="cerrar">×</button>}
          </div>
        </div>

        <div className="gv-sheet-body">
          {error && <div className="gv-err" style={{ marginBottom: 14 }}>{error}</div>}

          {phase === 'load' && (
            <div className="gv-proc"><div className="gv-proc-ring" /><div className="gv-proc-t">Cargando día…</div></div>
          )}

          {phase === 'summary' && (
            <div className="gv-day">
              {/* pipeline interrumpido: videos con serie de Hevy sin analizar */}
              {resumable.length > 0 && (
                <div className="gv-resume">
                  <div className="gv-resume-tx">
                    <b>Homologación pendiente</b>
                    <span>{resumable.length} video(s) quedaron sin analizar — el progreso vive en el servidor, no se perdió nada.</span>
                  </div>
                  <button className="gv-cta" onClick={() => void resumePipeline()} disabled={busy}>
                    <Play size={15} /> {busy ? 'Cargando…' : 'Reanudar'}
                  </button>
                </div>
              )}

              {/* pesos corregidos en Hevy después de registrar los videos */}
              {drifted.length > 0 && (
                <div className="gv-resume">
                  <div className="gv-resume-tx">
                    <b>Pesos corregidos en Hevy</b>
                    <span>
                      {drifted.map((d) => `set ${d.setNumber}: ${kg(d.from)} → ${kg(d.to)}kg`).join(' · ')}
                      {' '}— se actualiza el 1RM, sin re-analizar.
                    </span>
                  </div>
                  <button className="gv-cta" onClick={() => void fixDrift()} disabled={fixingDrift}>
                    {fixingDrift ? 'Corrigiendo…' : `Actualizar ${drifted.length}`}
                  </button>
                </div>
              )}

              {/* desglose general del día, por ejercicio */}
              {groups.map((g) => (
                <div className="gv-day-block" key={g.name}>
                  <div className="gv-day-h">{g.name}</div>
                  <div className="gv-day-aggr">
                    <span><b>{g.rows.length}</b> series</span>
                    <span><b>{g.totalReps}</b> reps</span>
                    {g.bestV != null && <span>mejor <b>{g.bestV}</b> m/s</span>}
                    {g.interSetLoss != null && (
                      <span className={g.interSetLoss > 10 ? 'warn' : ''}>
                        fatiga inter-serie <b>{g.interSetLoss > 0 ? '-' : '+'}{Math.abs(g.interSetLoss)}%</b>
                      </span>
                    )}
                    {g.best1rm != null && <span>1RM est. <b>{g.best1rm}</b>kg</span>}
                    {g.withHevy > 0 && (
                      <span className={g.verified === g.withHevy ? 'ok' : 'warn'}>
                        <Check size={12} /> <b>{g.verified}/{g.withHevy}</b> vs Hevy
                      </span>
                    )}
                  </div>
                  <table className="gv-table gv-frame gv-day-table">
                    <thead><tr>
                      <th>Set</th><th>Peso</th><th>Reps</th><th>V.media</th>
                      <th>V.pico</th><th>Pérdida</th><th>Zona</th><th></th>
                    </tr></thead>
                    <tbody>
                      {g.rows.map((s) => (
                        <tr key={s.id} onClick={() => onOpenSession(s.id)} style={{ cursor: 'pointer' }}>
                          <td>{s.hevy ? `#${s.hevy.set_number}` : '—'}</td>
                          <td>{kg(s.weight_kg)}kg</td>
                          <td>
                            {s.summary.rep_count || '·'}
                            {s.hevy?.reps != null && <span className="gv-day-sub">/{s.hevy.reps}</span>}
                          </td>
                          <td className="gv-pos">{s.summary.mean_velocity ?? '—'}</td>
                          <td>{s.summary.best_velocity ?? '—'}</td>
                          <td className={s.summary.velocity_loss_pct ? 'gv-neg' : ''}>
                            {s.summary.velocity_loss_pct ? `-${s.summary.velocity_loss_pct}%` : '—'}
                          </td>
                          <td>{s.summary.top_zone
                            ? <span className={`gv-zb z-${s.summary.top_zone}`}>{s.summary.top_zone}</span>
                            : '—'}</td>
                          <td>
                            {s.hevy?.rep_match?.ok
                              ? <span className="gv-day-okk"><Check size={12} /></span>
                              : s.summary.rep_count === 0
                                ? <span className="gv-day-sub">pendiente</span>
                                : s.hevy ? <span className="gv-day-warn">≠ hevy</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <div className="gv-actions" style={{ justifyContent: 'space-between' }}>
                <button className="gv-btn" style={{ background: 'transparent', color: '#fff' }} onClick={onManualEntry}>
                  Entrada manual
                </button>
                <button className="gv-cta" onClick={() => setPhase('pick')}>
                  <Plus size={15} /> Agregar videos
                </button>
              </div>
            </div>
          )}

          {phase === 'pick' && (
            <div className="gv-day">
              {/* qué se entrenó según Hevy */}
              {allExercises.length === 0 ? (
                <div className="gv-empty gv-frame">
                  <b>{day?.configured === false ? 'Hevy sin configurar' : 'Sin datos de Hevy ese día'}</b>
                  <span>
                    {day?.configured === false
                      ? 'Guarda tu API key de Hevy en Settings de GymBar y toca sync.'
                      : 'Si entrenaste, dale a sync; si no, registra una entrada manual.'}
                  </span>
                </div>
              ) : (
                <div className="gv-day-block">
                  <div className="gv-day-h">Según Hevy entrenaste</div>
                  <div className="gv-day-chips">
                    {allExercises.map((ex) => (
                      <button
                        key={ex.id}
                        className={`gv-pf gv-chrome ${exerciseId === ex.id ? 'on' : 'off'}`}
                        style={exerciseId === ex.id ? { background: '#000' } : undefined}
                        onClick={() => { setExerciseId(ex.id); setManualSlug('') }}
                      >
                        <span className="gv-nm">{ex.title}</span>
                        <span className="gv-ct">{ex.sets.length} SETS{ex.exercise_slug ? '' : ' · SIN MAPEAR'}</span>
                      </button>
                    ))}
                  </div>

                  {selected && !selected.exercise_slug && (
                    <div className="gv-field" style={{ marginTop: 12 }}>
                      <span className="gv-flabel">"{selected.title}" no está mapeado — ¿qué ejercicio de VBT es?</span>
                      <select className="gv-select" value={manualSlug} onChange={(e) => setManualSlug(e.target.value)}>
                        <option value="">elige…</option>
                        {catalog.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {selected && (
                    <div className="gv-day-sets">
                      {selected.sets.map((s) => {
                        const a = assignments.get(s.id)
                        const linked = s.session_id != null
                        return (
                          <div key={s.id} className={`gv-day-set${a ? ' picked' : ''}${linked ? ' linked' : ''}`}>
                            <span className="gv-day-sn">SET {s.number}</span>
                            <span className="gv-day-sl">{setLabel(s)}{s.type && s.type !== 'normal' ? ` · ${s.type}` : ''}</span>
                            {linked ? (
                              <button className="gv-day-openlink" onClick={() => onOpenSession(s.session_id!)}>
                                <Check size={13} /> {s.session_analyzed ? 'analizada' : 'con video'} — ver
                              </button>
                            ) : a ? (
                              <span className="gv-day-vid">
                                <Film size={13} /> {a.videoName}
                                <button className="gv-day-unpick" onClick={() => unassign(s.id)} title="quitar video"><X size={12} /></button>
                              </span>
                            ) : (
                              <button className="gv-btn gv-day-pick" onClick={() => void pickVideoFor(s)}>
                                <Plus size={13} /> video
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="gv-day-opts">
                <div className="gv-field">
                  <span className="gv-flabel">Motor de pose</span>
                  <select className="gv-select" value={pose} onChange={(e) => setPose(e.target.value)}>
                    <option value="">Sin pose — solo barra (recomendado)</option>
                    <option value="mediapipe">MediaPipe (experimental, glitchea con discos)</option>
                    <option value="yolo">YOLOv8-Pose (experimental)</option>
                  </select>
                </div>
                <div className="gv-field">
                  <span className="gv-flabel">Ø disco (m)</span>
                  <input className="gv-input" inputMode="decimal" value={plate}
                    onChange={(e) => setPlate(e.target.value)} style={{ minWidth: 0 }} />
                </div>
              </div>

              <div className="gv-actions" style={{ justifyContent: 'space-between' }}>
                {sessions.length > 0 ? (
                  <button className="gv-btn" style={{ background: 'transparent', color: '#fff' }}
                    onClick={() => setPhase('summary')}>
                    ← Resumen del día
                  </button>
                ) : (
                  <button className="gv-btn" style={{ background: 'transparent', color: '#fff' }} onClick={onManualEntry}>
                    Entrada manual
                  </button>
                )}
                <button className="gv-cta" onClick={() => void createAll()} disabled={!canCreate}>
                  {busy
                    ? 'Subiendo videos…'
                    : assigned.length === 0
                      ? 'Asigna videos a las series'
                      : `Continuar con ${assigned.length} ${assigned.length === 1 ? 'serie' : 'series'} →`}
                </button>
              </div>
            </div>
          )}

          {phase === 'seed' && items[seedIdx] && (
            <SeedStep
              key={items[seedIdx].session.id}
              item={items[seedIdx]}
              onNext={() => void nextSeed()}
              onBox={setSeedBox}
            />
          )}

          {(phase === 'analyze' || phase === 'done') && (
            <div className="gv-day-verify">
              <div className="gv-day-thumbs">
                {items.map((it, i) => (
                  <div key={it.session.id}
                    className={`gv-thumb ${it.status}`}
                    onClick={() => { if (phase === 'done') onOpenSession(it.session.id) }}
                    role={phase === 'done' ? 'button' : undefined}
                  >
                    {it.session.first_frame_url
                      ? <img src={it.session.first_frame_url} alt={`set ${it.set.number}`} />
                      : <div className="gv-thumb-ph"><Film size={22} /></div>}
                    <div className="gv-thumb-cap">
                      <b>SET {it.set.number}</b> · {setLabel(it.set)}
                    </div>
                    {it.status === 'processing' && <div className="gv-thumb-spin" />}
                    {it.status === 'ok' && (
                      <div className="gv-thumb-badge ok">
                        <AnimatedCheck delayMs={i * 160} />
                        <span>{it.detected}/{it.set.reps} reps</span>
                      </div>
                    )}
                    {it.status === 'mismatch' && (
                      <div className="gv-thumb-badge warn">
                        <span>detectó {it.detected ?? '?'} / logueaste {it.set.reps ?? '?'}</span>
                      </div>
                    )}
                    {it.status === 'error' && (
                      <div className="gv-thumb-badge err"><span>{it.error ?? 'falló'}</span></div>
                    )}
                  </div>
                ))}
              </div>

              {phase === 'analyze' ? (
                <div className="gv-proc" style={{ paddingTop: 8 }}>
                  <div className="gv-proc-s">Procesando en orden — la visión por computador es pesada.</div>
                </div>
              ) : (
                <>
                  <div className="gv-day-summary">
                    {okCount === items.length
                      ? <>Todo cuadra: <b>{okCount}/{items.length}</b> series verificadas contra Hevy ✓</>
                      : <>Verificadas <b>{okCount}/{items.length}</b> — en las que no cuadran, abre la sesión y usa “Re-ajustar barra”.</>}
                  </div>
                  <div className="gv-actions" style={{ marginTop: 14 }}>
                    <button className="gv-cta" onClick={() => { onComplete(); onClose() }}>
                      <Check size={16} /> Listo
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Paso de seed para un video del lote.
function SeedStep({ item, onNext, onBox }: {
  item: Item
  onNext: () => void
  onBox: (b: { x: number; y: number; w: number; h: number } | null) => void
}) {
  return (
    <div>
      <div className="gv-day-seedcap">
        SET {item.set.number} · {setLabel(item.set)} — marca el disco en el primer frame
      </div>
      {item.session.first_frame_url
        ? <SeedMarker frame={0} imageUrl={item.session.first_frame_url}
            getInitial={() => item.session.bar_seed} onChange={onBox} />
        : <div className="gv-noanno">No se pudo cargar el primer frame.</div>}
      <div className="gv-actions" style={{ marginTop: 18 }}>
        <button className="gv-btn" style={{ background: 'transparent', color: '#fff' }} onClick={onNext}>
          Saltar marcado
        </button>
        <button className="gv-cta" onClick={onNext}>
          <Cpu size={16} /> Siguiente
        </button>
      </div>
    </div>
  )
}
