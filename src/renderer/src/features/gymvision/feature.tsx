import { useCallback, useEffect, useState } from 'react'
import { Gauge, Plus } from 'lucide-react'
import type { FeatureDescriptor } from '../types'
import './gymvision.css'
import {
  gv, humanError, ZONE_LABEL, ZONE_ORDER,
  type Athlete, type SessionRow, type SessionDetail, type VbtSummary, type Keyframe, type PoseKeyframe,
} from './api'
import { Calendar } from './Calendar'
import { DayFlow } from './DayFlow'
import { EntryFlow } from './EntryFlow'
import { SessionView } from './SessionView'
import { KeyframeAnnotator } from './KeyframeAnnotator'

type Status = 'loading' | 'offline' | 'ready'

function GymVisionPage() {
  const [status, setStatus] = useState<Status>('loading')
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [summary, setSummary] = useState<VbtSummary | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  // flujo de entrada + vista de detalle
  const [entryDate, setEntryDate] = useState<string | null>(null)
  const [entryOpen, setEntryOpen] = useState(false)
  const [dayOpen, setDayOpen] = useState<string | null>(null) // día con precarga Hevy
  const [dayAutoResume, setDayAutoResume] = useState(false) // abierto desde el banner de pendientes
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  // re-calibración de una sesión existente desde su detalle
  const [readjust, setReadjust] = useState(false)
  const [reBusy, setReBusy] = useState(false)
  const [reError, setReError] = useState<string | null>(null)
  // corrección de peso desde el detalle (drift vs Hevy o edición manual)
  const [wEdit, setWEdit] = useState('')
  const [wBusy, setWBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const ping = await gv.ping()
      if (!ping.ok) { setStatus('offline'); return }
      const [a, s, ss] = await Promise.all([gv.athletes(), gv.summary(), gv.sessions()])
      setAthletes(a.data ?? [])
      setSummary(s.data ?? null)
      setSessions(ss.data ?? [])
      setStatus('ready')
    } catch {
      // cualquier fallo del puente IPC / API → tratar como offline, nunca colgar
      setStatus('offline')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Guarda de proceso para la re-calibración (keyframes + re-análisis).
  useEffect(() => {
    if (reBusy) {
      void gv.setBusy('Re-analizando una sesión con anclas manuales')
      window.onbeforeunload = (e) => { e.preventDefault(); return '' }
    } else {
      void gv.setBusy(null)
      window.onbeforeunload = null
    }
    return () => { window.onbeforeunload = null }
  }, [reBusy])

  const active = athletes.find((x) => x.is_active) ?? null

  const switchTo = async (slug: string) => {
    if (busy || slug === active?.slug) return
    setBusy(true)
    await gv.activate(slug)
    await load()
    setBusy(false)
  }

  const addProfile = async () => {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    const r = await gv.createAthlete(name)
    if (r.ok) setNewName('')
    await load()
    setBusy(false)
  }

  const openEntry = (date?: string) => { setEntryDate(date ?? null); setEntryOpen(true) }

  const viewSession = async (s: SessionRow) => {
    const r = await gv.session(s.id)
    if (r.ok && r.data) setDetail(r.data)
  }

  const viewSessionById = async (id: number) => {
    const r = await gv.session(id)
    if (r.ok && r.data) setDetail(r.data)
  }

  const closeDetail = () => {
    if (reBusy) return
    setDetail(null); setReadjust(false); setReError(null); setWEdit('')
  }

  // Corrige el peso sin re-analizar (el server recalcula solo el 1RM).
  const applyWeight = async (payload: { from_hevy: true } | { weight_kg: number }) => {
    if (!detail || wBusy) return
    setWBusy(true)
    setReError(null)
    const r = await gv.updateWeight(detail.id, payload)
    setWBusy(false)
    if (!r.ok || !r.data) {
      setReError(humanError(r.error, 'No se pudo corregir el peso'))
      return
    }
    setDetail(r.data)
    setWEdit('')
    void load()
  }

  // Re-analiza la sesión ABIERTA con las anotaciones manuales (keyframes) como
  // verdad absoluta. saveKeyframes + analyze; aplica también el filtro de reps.
  const reanalyze = async (bar: Keyframe[], pose: PoseKeyframe[]) => {
    if (!detail || reBusy) return
    setReError(null)
    setReBusy(true)
    try {
      const saved = await gv.saveKeyframes(detail.id, bar, pose)
      if (!saved.ok) {
        setReError(humanError(saved.error, 'Error al guardar las anclas'))
        return
      }
      const r = await gv.analyze(detail.id)
      if (!r.ok || !r.data) {
        setReError(humanError(r.error, 'Análisis falló'))
        return
      }
      setDetail(r.data); setReadjust(false)
      void load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error inesperado'
      setReError(msg.includes('No handler registered')
        ? 'Motor desactualizado — cierra la app por completo (Cmd+Q) y vuelve a abrirla.'
        : msg)
    } finally {
      setReBusy(false)
    }
  }

  // ---- estados de carga / offline -----------------------------------------
  if (status === 'loading') {
    return (
      <div className="gv-root">
        <div className="gv-wrap">
          <span className="gv-kicker">GymVision · VBT</span>
          <h1 className="gv-title">VBT<br />LAB</h1>
          <p className="gv-sub"><span className="gv-spin" /> &nbsp;conectando con el motor de visión…</p>
        </div>
      </div>
    )
  }

  if (status === 'offline') {
    return (
      <div className="gv-root">
        <div className="gv-wrap">
          <span className="gv-kicker">GymVision · VBT</span>
          <h1 className="gv-title">VBT<br />LAB</h1>
          <div className="gv-frame gv-empty" style={{ marginTop: 22 }}>
            <b>Motor offline</b>
            <span>El server de GymVision no responde. Arráncalo para ver tus datos de velocidad:</span>
            <div className="gv-cmd">cd ~/Developer/gymvision &amp;&amp; python manage.py runserver</div>
            <div style={{ marginTop: 16 }}>
              <button className="gv-btn" onClick={() => { setStatus('loading'); void load() }}>
                Reintentar
              </button>
            </div>
          </div>
          <div className="gv-foot"><span className="gv-dot" /> GYMVISION · API esperada en 127.0.0.1:8000</div>
        </div>
      </div>
    )
  }

  // ---- listo --------------------------------------------------------------
  const trend = summary?.velocity_trend ?? []
  const maxV = Math.max(0, ...trend.map((t) => t.mean_velocity)) || 1
  const zoneTotal = Object.values(summary?.zone_distribution ?? {}).reduce((a, b) => a + b, 0) || 1
  const zoneRows = ZONE_ORDER
    .map((z) => ({ zone: z, count: summary?.zone_distribution?.[z] ?? 0 }))
    .filter((r) => r.count > 0)
    .map((r) => ({ ...r, pct: Math.round((r.count / zoneTotal) * 100) }))
  const bestPr = summary?.prs?.[0] ?? null

  // Homologaciones a medias: sesiones con serie de Hevy pero 0 reps analizadas
  // (la app se cerró a mitad del pipeline). Derivado del servidor — sobrevive
  // reinicios de la ventana sin estado local.
  const pending = sessions.filter((s) => s.hevy && s.summary.rep_count === 0)
  const pendingDate = pending[0]?.date ?? null

  return (
    <div className="gv-root">
      <div className="gv-wrap">
        <header>
          <span className="gv-kicker">GymVision · Velocity-Based Training</span>
          <h1 className="gv-title">VBT<br />LAB</h1>
          <p className="gv-sub">Forma &amp; velocidad por visión · research multi-perfil</p>

          <div className="gv-profiles">
            <span className="gv-pflabel">Perfil //</span>
            {athletes.map((a) => (
              <button
                key={a.slug}
                className={`gv-pf gv-chrome ${a.is_active ? 'on' : 'off'}`}
                style={a.is_active ? { background: '#000' } : undefined}
                onClick={() => void switchTo(a.slug)}
                disabled={busy}
              >
                <span className="gv-nm">{a.name}</span>
                <span className="gv-ct">{a.session_count} SES{a.is_active ? ' · ACTIVO' : ''}</span>
              </button>
            ))}
          </div>

          <div className="gv-addrow">
            <input
              className="gv-input"
              placeholder="nuevo perfil (research)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addProfile() }}
            />
            <button className="gv-btn" onClick={() => void addProfile()} disabled={busy || !newName.trim()}>
              + perfil
            </button>
          </div>
        </header>

        {/* homologación interrumpida → reanudar donde quedó */}
        {pendingDate && (
          <section className="gv-sec">
            <div className="gv-resume gv-frame">
              <div className="gv-resume-tx">
                <b>Homologación pendiente</b>
                <span>{pending.length} video(s) del {pendingDate} sin analizar — reanuda donde quedaste.</span>
              </div>
              <button className="gv-cta" onClick={() => { setDayAutoResume(true); setDayOpen(pendingDate) }}>
                Reanudar
              </button>
            </div>
          </section>
        )}

        {/* calendario 30 días + nueva entrada */}
        <section className="gv-sec">
          <div className="gv-h2" style={{ alignItems: 'center' }}>
            <b>Actividad — 30 días</b><span className="gv-ln" />
            <button className="gv-cta" onClick={() => openEntry()}><Plus size={16} /> Nueva entrada</button>
          </div>
          <Calendar
            sessions={sessions}
            onPickDay={(d) => setDayOpen(d)}
          />
        </section>

        {/* stats */}
        <div className="gv-stats">
          <div className="gv-stat gv-chrome gv-frame">
            <div className="gv-t">Sesiones</div>
            <div className="gv-v">{summary?.session_count ?? 0}</div><div className="gv-scan" />
          </div>
          <div className="gv-stat gv-chrome gv-frame">
            <div className="gv-t">Última sesión</div>
            <div className="gv-v" style={{ fontSize: 20 }}>{summary?.last_session ?? '—'}</div><div className="gv-scan" />
          </div>
          <div className="gv-stat gv-chrome gv-frame">
            <div className="gv-t">Mejor 1RM est.</div>
            <div className="gv-v">{bestPr ? <>{bestPr.best_1rm}<span className="gv-u">kg</span></> : '—'}</div><div className="gv-scan" />
          </div>
          <div className="gv-stat gv-chrome gv-frame">
            <div className="gv-t">Zonas activas</div>
            <div className="gv-v">{zoneRows.length}</div><div className="gv-scan" />
          </div>
        </div>

        {/* velocity trend */}
        <section className="gv-sec">
          <div className="gv-h2"><b>Tendencia de velocidad</b><span className="gv-ln" />
            <span className="gv-tag">m/s media · por sesión</span></div>
          {trend.length > 0 ? (
            <div className="gv-trend gv-frame">
              {trend.map((t) => (
                <div className="gv-bar" key={t.session_id} title={`${t.exercise} · ${t.date} · ${t.mean_velocity} m/s`}>
                  <span className="gv-vv">{t.mean_velocity}</span>
                  <div className="gv-col" style={{ height: `${Math.max(12, Math.round((t.mean_velocity / maxV) * 150))}px` }} />
                  <span className="gv-ex">{t.exercise.slice(0, 8)}</span>
                  <span className="gv-dd">{t.date.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="gv-empty gv-frame"><b>Sin velocidad</b><span>Analiza una sesión con video en GymVision.</span></div>
          )}
        </section>

        {/* zones */}
        {zoneRows.length > 0 && (
          <section className="gv-sec">
            <div className="gv-h2"><b>Distribución de zonas</b><span className="gv-ln" />
              <span className="gv-tag">% de reps</span></div>
            <div className="gv-zones">
              {zoneRows.map((z) => (
                <div className={`gv-zrow z-${z.zone}`} key={z.zone}>
                  <span className="gv-zl">{ZONE_LABEL[z.zone] ?? z.zone.toUpperCase()}</span>
                  <div className="gv-ztrack"><div className="gv-zfill" style={{ width: `${z.pct}%` }} /></div>
                  <span className="gv-zp">{z.pct}%</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PRs */}
        {(summary?.prs?.length ?? 0) > 0 && (
          <section className="gv-sec">
            <div className="gv-h2"><b>Records (1RM est.)</b><span className="gv-ln" />
              <span className="gv-tag">por ejercicio</span></div>
            <div className="gv-prs">
              {summary!.prs.map((p) => (
                <div className="gv-pr gv-chrome gv-frame gv-frame-acid" key={p.exercise}>
                  <div className="gv-ex">{p.exercise}</div>
                  <div className="gv-n">{p.best_1rm}<span className="gv-k"> kg</span></div>
                  <div className="gv-m">{p.weight_kg}kg · {p.date}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* sessions table */}
        <section className="gv-sec">
          <div className="gv-h2"><b>Sesiones</b><span className="gv-ln" />
            <span className="gv-tag">{sessions.length} registradas</span></div>
          {sessions.length > 0 ? (
            <table className="gv-table gv-frame">
              <thead><tr>
                <th>Fecha</th><th>Ejercicio</th><th>Peso</th><th>Reps</th>
                <th>V.media</th><th>V.pico</th><th>Pérdida</th><th>1RM</th><th>Zona</th>
              </tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} onClick={() => void viewSession(s)} style={{ cursor: 'pointer' }}>
                    <td>{s.date}</td>
                    <td>{s.exercise}</td>
                    <td>{s.weight_kg}kg</td>
                    <td>{s.summary.rep_count}</td>
                    <td className="gv-pos">{s.summary.mean_velocity ?? '—'}</td>
                    <td>{s.summary.best_velocity ?? '—'}</td>
                    <td className={s.summary.velocity_loss_pct ? 'gv-neg' : ''}>
                      {s.summary.velocity_loss_pct ? `-${s.summary.velocity_loss_pct}%` : '—'}</td>
                    <td>{s.summary.best_1rm ? `${s.summary.best_1rm}kg` : '—'}</td>
                    <td>{s.summary.top_zone
                      ? <span className={`gv-zb z-${s.summary.top_zone}`}>{s.summary.top_zone}</span>
                      : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="gv-empty gv-frame"><b>Sin sesiones</b><span>Este perfil aún no tiene sesiones.</span></div>
          )}
        </section>

        <div className="gv-foot">
          <span className="gv-dot" /> GYMVISION VBT · {active?.name ?? '—'} · datos locales vía API 127.0.0.1:8000
        </div>
      </div>

      {/* overlay: día del calendario con las series de Hevy precargadas.
          Se mantiene MONTADO aunque se abra un detalle encima (el detalle
          renderiza después → queda arriba): así no se pierde el pipeline. */}
      {dayOpen && !entryOpen && (
        <DayFlow
          date={dayOpen}
          sessions={sessions.filter((s) => s.date === dayOpen)}
          autoResume={dayAutoResume}
          onClose={() => { setDayOpen(null); setDayAutoResume(false) }}
          onOpenSession={(id) => void viewSessionById(id)}
          onManualEntry={() => { const d = dayOpen; setDayOpen(null); setDayAutoResume(false); openEntry(d ?? undefined) }}
          onComplete={() => void load()}
        />
      )}

      {/* overlay: flujo de nueva entrada */}
      {entryOpen && (
        <EntryFlow
          prefillDate={entryDate}
          onClose={() => setEntryOpen(false)}
          onComplete={() => void load()}
        />
      )}

      {/* overlay: detalle de sesión (preview + desglose + re-calibración) */}
      {detail && (
        <div className="gv-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeDetail() }}>
          <div className="gv-sheet gv-sheet-wide" role="dialog" aria-modal="true">
            <div className="gv-sheet-head">
              <b>
                {detail.exercise} · {detail.date} · {Math.round(detail.weight_kg * 2) / 2}kg
                {readjust && ' · re-ajustar barra'}
              </b>
              <button className="gv-close" onClick={closeDetail} aria-label="cerrar">×</button>
            </div>
            <div className="gv-sheet-body">
              {readjust && detail.first_frame_url ? (
                <KeyframeAnnotator
                  session={detail}
                  busy={reBusy}
                  error={reError}
                  onReanalyze={(bar, pose) => void reanalyze(bar, pose)}
                  onCancel={() => { if (!reBusy) { setReadjust(false); setReError(null) } }}
                />
              ) : (
                <>
                  <SessionView
                    session={detail}
                    // mejor PICO histórico del MISMO ejercicio (excluyendo esta
                    // sesión) — base correcta para el velocímetro en vivo, que
                    // también lee velocidad instantánea. Contra la media
                    // (best_velocity) la aguja pegaba al tope en cada rep: un
                    // pico dentro de la rep es sistemáticamente más alto que
                    // cualquier promedio.
                    historicalMax={(() => {
                      const others = sessions.filter(
                        (x) => x.exercise_slug === detail.exercise_slug && x.id !== detail.id
                          && x.summary.best_velocity_peak != null)
                      return others.length
                        ? Math.max(...others.map((x) => x.summary.best_velocity_peak!))
                        : null
                    })()}
                  />
                  {reError && <div className="gv-err" style={{ marginTop: 14 }}>{reError}</div>}

                  {/* peso corregido en Hevy después de registrar el video */}
                  {detail.hevy?.weight_drift && (
                    <div className="gv-resume" style={{ marginTop: 14 }}>
                      <div className="gv-resume-tx">
                        <b>Peso corregido en Hevy</b>
                        <span>
                          Hevy dice {Math.round(detail.hevy.weight_kg! * 2) / 2}kg, la sesión guarda{' '}
                          {Math.round(detail.weight_kg * 2) / 2}kg — se recalcula el 1RM, sin re-analizar.
                        </span>
                      </div>
                      <button className="gv-cta" disabled={wBusy}
                        onClick={() => void applyWeight({ from_hevy: true })}>
                        {wBusy ? '…' : 'Usar peso de Hevy'}
                      </button>
                    </div>
                  )}

                  <div className="gv-actions" style={{ marginTop: 18, justifyContent: 'flex-start', alignItems: 'center', gap: 10 }}>
                    <button className="gv-btn" style={{ background: 'transparent', color: '#fff' }}
                      onClick={() => setReadjust(true)} disabled={!detail.first_frame_url}>
                      ✎ Anotar barra (keyframes)
                    </button>
                    <span style={{ flex: 1 }} />
                    <input className="gv-input" inputMode="decimal" placeholder={`peso (${detail.weight_kg}kg)`}
                      value={wEdit} onChange={(e) => setWEdit(e.target.value)}
                      style={{ width: 130, minWidth: 0 }} />
                    <button className="gv-btn" disabled={wBusy || !(Number(wEdit) > 0)}
                      onClick={() => void applyWeight({ weight_kg: Number(wEdit) })}>
                      corregir peso
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const feature: FeatureDescriptor = {
  id: 'gymvision',
  label: 'VBT Lab',
  icon: Gauge,
  Component: GymVisionPage,
}
