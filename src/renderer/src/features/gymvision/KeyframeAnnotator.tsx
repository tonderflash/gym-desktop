import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Cpu } from 'lucide-react'
import type { SessionDetail, Keyframe, PoseKeyframe, PoseJoint, Bbox } from './api'
import { AnnotationCanvas } from './AnnotationCanvas'

const PROC_MSGS = [
  'Guardando anclas…',
  'Rastreando la barra entre tus marcas…',
  'Calculando ángulos desde tus puntos…',
  'Detectando repeticiones…',
  'Dibujando el path de la barra…',
]

// Labels anclables: barra (caja) + articulaciones (puntos) que alimentan los ángulos.
const LABELS: { key: string; label: string; color: string }[] = [
  { key: 'bar', label: 'Barra', color: '#c2f542' },
  { key: 'shoulder', label: 'Hombro', color: '#4ea8ff' },
  { key: 'hip', label: 'Cadera', color: '#ff7ad9' },
  { key: 'knee', label: 'Rodilla', color: '#ffd24e' },
  { key: 'ankle', label: 'Tobillo', color: '#7affc2' },
]
const colorOf = (k: string) => LABELS.find((l) => l.key === k)?.color ?? '#c2f542'
const labelOf = (k: string) => LABELS.find((l) => l.key === k)?.label ?? k

/** Anotador frame-a-frame multi-label. Barra (caja) + articulaciones (puntos),
 *  todo verdad absoluta. Frames exactos vía frame.jpg?n= (mismo decode del tracker). */
export function KeyframeAnnotator({ session, busy, error, onReanalyze, onCancel }: {
  session: SessionDetail
  busy: boolean
  error?: string | null
  onReanalyze: (bar: Keyframe[], pose: PoseKeyframe[]) => void
  onCancel: () => void
}) {
  const total = Math.max(1, session.frame_count ?? 1)
  const fps = session.fps ?? 30
  const last = total - 1

  const frameUrl = useCallback((n: number) => {
    if (!session.first_frame_url) return ''
    return session.first_frame_url.replace(/first-frame\.jpg(?:\?.*)?$/, `frame.jpg?n=${n}`)
  }, [session.first_frame_url])

  const initialBar = useMemo<Keyframe[]>(() => {
    if (session.bar_keyframes?.length) return [...session.bar_keyframes].sort((a, b) => a.frame - b.frame)
    if (session.bar_seed && session.bar_seed.length === 4) {
      const [x, y, w, h] = session.bar_seed
      return [{ frame: 0, x, y, w, h }]
    }
    return []
  }, [session])
  const initialPose = useMemo<PoseKeyframe[]>(() => [...(session.pose_keyframes ?? [])], [session])

  const [frame, setFrame] = useState(0)
  const [label, setLabel] = useState('bar')
  const [relBar, setRelBar] = useState(false)
  const [bar, setBar] = useState<Keyframe[]>(initialBar)
  const [pose, setPose] = useState<PoseKeyframe[]>(initialPose)
  const [procMsg, setProcMsg] = useState(PROC_MSGS[0])
  const procTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const frameRef = useRef(0)
  const relBarRef = useRef(false)
  relBarRef.current = relBar

  useEffect(() => { setBar(initialBar) }, [initialBar])
  useEffect(() => { setPose(initialPose) }, [initialPose])

  const seekTo = useCallback((n: number) => {
    const v = Math.max(0, Math.min(last, n))
    frameRef.current = v
    setFrame(v)
  }, [last])

  const barForFrame = (n: number): number[] | null => {
    const k = bar.find((b) => b.frame === n)
    return k ? [k.x, k.y, k.w, k.h] : null
  }
  const jointsForFrame = (n: number) => pose.filter((p) => p.frame === n)

  const onBar = (b: Bbox | null) => {
    const n = frameRef.current
    setBar((prev) => {
      const rest = prev.filter((k) => k.frame !== n)
      return (b ? [...rest, { frame: n, ...b }] : rest).sort((a, c) => a.frame - c.frame)
    })
  }
  const onJoint = (joint: string, p: { x: number; y: number } | null) => {
    const n = frameRef.current
    setPose((prev) => {
      const rest = prev.filter((k) => !(k.frame === n && k.joint === joint))
      return (p
        ? [...rest, { frame: n, joint: joint as PoseJoint, x: p.x, y: p.y, rel_bar: relBarRef.current }]
        : rest
      ).sort((a, c) => a.frame - c.frame || a.joint.localeCompare(c.joint))
    })
  }

  // al cambiar a una articulación, reflejar si ya tiene un ancla "sigue barra"
  useEffect(() => {
    if (label === 'bar') return
    setRelBar(pose.some((k) => k.joint === label && k.rel_bar))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label])

  // frames con cualquier ancla (para los marcadores del scrubber)
  const markedFrames = useMemo(() => {
    const m = new Map<number, string>()  // frame → color (barra gana visualmente)
    for (const p of pose) if (!m.has(p.frame)) m.set(p.frame, colorOf(p.joint))
    for (const b of bar) m.set(b.frame, colorOf('bar'))
    return [...m.entries()].sort((a, c) => a[0] - c[0])
  }, [bar, pose])

  const tlabel = (n: number) => `${(n / fps).toFixed(1)}s`
  const anchoredHere = !!barForFrame(frame) || jointsForFrame(frame).length > 0

  useEffect(() => {
    if (!busy) return
    let i = 0
    setProcMsg(PROC_MSGS[0])
    procTimer.current = setInterval(() => { i = (i + 1) % PROC_MSGS.length; setProcMsg(PROC_MSGS[i]) }, 2200)
    return () => { if (procTimer.current) clearInterval(procTimer.current) }
  }, [busy])

  if (busy) {
    return (
      <div className="gv-empty gv-frame" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <span className="gv-spin" style={{ marginBottom: 16, display: 'inline-block' }} />
        <b>Re-analizando ({bar.length} barra · {pose.length} pose)</b>
        <span style={{ display: 'block', marginTop: 8, color: '#9fb' }}>{procMsg}</span>
      </div>
    )
  }

  return (
    <div>
      {/* selector de label */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {LABELS.map((l) => {
          const on = label === l.key
          return (
            <button key={l.key} onClick={() => setLabel(l.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                borderRadius: 8, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${on ? l.color : '#ffffff22'}`,
                background: on ? `${l.color}22` : 'transparent', color: on ? l.color : '#cfe' }}>
              <span style={{ width: 9, height: 9, borderRadius: l.key === 'bar' ? 2 : '50%', background: l.color }} />
              {l.label}
            </button>
          )
        })}
      </div>

      {/* toggle: la articulación sigue la barra (para cuando el plato la ocluye) */}
      {label !== 'bar' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
          fontSize: 12, color: relBar ? '#c2f542' : '#9fb', cursor: 'pointer' }}>
          <input type="checkbox" checked={relBar} onChange={(e) => setRelBar(e.target.checked)}
            style={{ accentColor: '#c2f542' }} />
          ⛓ {labelOf(label)} sigue la barra — márcala una vez en un frame visible y se
          repone como offset del plato en cada fondo (ideal para el hombro).
        </label>
      )}

      {/* navegación de frames */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button className="gv-btn" style={navBtn} onClick={() => seekTo(frame - 10)}>−10</button>
        <button className="gv-btn" style={navBtn} onClick={() => seekTo(frame - 1)}><ChevronLeft size={14} /></button>
        <div style={{ flex: 1, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: '#cfe' }}>
          frame <b>{frame}</b> / {last} · {tlabel(frame)}{anchoredHere && <span style={{ color: '#c2f542' }}> · ● anclada</span>}
        </div>
        <button className="gv-btn" style={navBtn} onClick={() => seekTo(frame + 1)}><ChevronRight size={14} /></button>
        <button className="gv-btn" style={navBtn} onClick={() => seekTo(frame + 10)}>+10</button>
      </div>

      {/* scrubber con marcadores */}
      <div style={{ position: 'relative', marginBottom: 6 }}>
        <input type="range" min={0} max={last} step={1} value={frame}
          onChange={(e) => seekTo(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#c2f542', position: 'relative', zIndex: 2, cursor: 'pointer' }} />
        <div style={{ position: 'relative', height: 10, pointerEvents: 'none' }}>
          {markedFrames.map(([f, col]) => (
            <div key={f} title={`frame ${f}`} onClick={() => seekTo(f)}
              style={{ position: 'absolute', left: `${last ? (f / last) * 100 : 0}%`, transform: 'translateX(-50%)',
                width: 8, height: 8, background: col, border: '1px solid #0d3238', borderRadius: 2,
                cursor: 'pointer', pointerEvents: 'auto' }} />
          ))}
        </div>
      </div>

      {/* lienzo de anotación */}
      <AnnotationCanvas
        imageUrl={frameUrl(frame)}
        frame={frame}
        bar={barForFrame(frame)}
        joints={jointsForFrame(frame)}
        active={label}
        jointColor={colorOf}
        jointLabel={labelOf}
        onBar={onBar}
        onJoint={onJoint}
      />

      <p className="gv-seed-hint" style={{ marginTop: 8 }}>
        <b>Barra</b>: encuadra la placa. <b>Articulaciones</b>: márcalas en el <b>fondo</b> de la rep
        (el punto más profundo) para que el ángulo sea exacto aunque la pose automática falle.
      </p>

      {error && <p className="gv-seed-hint" style={{ marginTop: 4, color: '#f88' }}>{error}</p>}

      <div className="gv-actions" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        <button className="gv-btn" style={{ background: 'transparent', color: '#fff' }} onClick={onCancel}>Cancelar</button>
        <button className="gv-cta" onClick={() => onReanalyze(bar, pose)} disabled={bar.length === 0 && pose.length === 0}>
          <Cpu size={16} /> Re-analizar ({bar.length}b · {pose.length}p)
        </button>
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = { padding: '4px 10px', minWidth: 0, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }
