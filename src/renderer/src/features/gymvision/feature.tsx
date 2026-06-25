import { useCallback, useEffect, useState } from 'react'
import { Gauge, Plus } from 'lucide-react'
import type { FeatureDescriptor } from '../types'
import './gymvision.css'
import {
  gv, ZONE_LABEL, ZONE_ORDER,
  type Athlete, type SessionRow, type SessionDetail, type VbtSummary, type Keyframe, type PoseKeyframe,
} from './api'
import { Calendar } from './Calendar'
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
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  // re-calibración de una sesión existente desde su detalle
  const [readjust, setReadjust] = useState(false)
  const [reBusy, setReBusy] = useState(false)
  const [reError, setReError] = useState<string | null>(null)

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

  const closeDetail = () => {
    if (reBusy) return
    setDetail(null); setReadjust(false); setReError(null)
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
        setReError(saved.error === 'offline' ? 'No se pudieron guardar las anclas.' : (saved.error ?? 'Error al guardar'))
        return
      }
      const r = await gv.analyze(detail.id)
      if (!r.ok || !r.data) {
        setReError(r.error === 'offline' ? 'El análisis tardó demasiado o el server cayó.' : (r.error ?? 'Análisis falló'))
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

        {/* calendario 30 días + nueva entrada */}
        <section className="gv-sec">
          <div className="gv-h2" style={{ alignItems: 'center' }}>
            <b>Actividad — 30 días</b><span className="gv-ln" />
            <button className="gv-cta" onClick={() => openEntry()}><Plus size={16} /> Nueva entrada</button>
          </div>
          <Calendar
            sessions={sessions}
            onPickDay={(d) => openEntry(d)}
            onPickSession={(s) => void viewSession(s)}
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
          <div className="gv-sheet" role="dialog" aria-modal="true">
            <div className="gv-sheet-head">
              <b>
                {detail.exercise} · {detail.date} · {detail.weight_kg}kg
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
                  <SessionView session={detail} />
                  <div className="gv-actions" style={{ marginTop: 18, justifyContent: 'flex-start' }}>
                    <button className="gv-btn" style={{ background: 'transparent', color: '#fff' }}
                      onClick={() => setReadjust(true)} disabled={!detail.first_frame_url}>
                      ✎ Anotar barra (keyframes)
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
