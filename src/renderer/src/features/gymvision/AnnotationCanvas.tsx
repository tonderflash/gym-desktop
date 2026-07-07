import { useRef, useState, useEffect, useCallback } from 'react'
import type { Bbox } from './api'

type DispBox = { x: number; y: number; w: number; h: number }
type Corner = 'nw' | 'ne' | 'sw' | 'se'
type Pt = { x: number; y: number }
type JointPt = { joint: string; x: number; y: number; rel_bar?: boolean }  // source coords
type Drag =
  | { kind: 'draw'; ox: number; oy: number }
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'resize'; fx: number; fy: number }
  | { kind: 'joint'; joint: string }
  | null

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))
const rectFrom = (ax: number, ay: number, bx: number, by: number): DispBox => ({
  x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(ax - bx), h: Math.abs(ay - by),
})

/** Canvas de anotación: caja de la barra + puntos de articulación sobre un frame.
 *  Edita el label ACTIVO; los demás se muestran read-only. Coords del VIDEO.
 *
 *  El frame se muestra con un <video> local seekeado — scrub instantáneo y
 *  fluido (el JPEG por HTTP tardaba cientos de ms por frame y el arrastre se
 *  congelaba). Si el códec no decodifica (p. ej. HEVC sin soporte), cae solo
 *  al modo <img> con frame.jpg, como antes. */
export function AnnotationCanvas({ imageUrl, videoUrl, fps = 30, frame, bar, joints, active, jointColor, jointLabel, onBar, onJoint }: {
  imageUrl: string
  videoUrl?: string | null       // fuente para scrub fluido; ausente = solo JPEG
  fps?: number
  frame: number
  bar: number[] | null
  joints: JointPt[]
  active: string                 // 'bar' | joint name
  jointColor: (j: string) => string
  jointLabel: (j: string) => string
  onBar: (b: Bbox | null) => void
  onJoint: (joint: string, p: Pt | null) => void
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const drag = useRef<Drag>(null)
  const barRef = useRef(bar)
  barRef.current = bar
  const [box, setBox] = useState<DispBox | null>(null)
  const [imgSrc, setImgSrc] = useState(imageUrl)
  const [videoFailed, setVideoFailed] = useState(false)
  const [liveJoint, setLiveJoint] = useState<{ joint: string; x: number; y: number } | null>(null)

  const videoMode = !!videoUrl && !videoFailed
  // elemento visible actual (video o img) — toda la geometría se mide de aquí
  const mediaEl = (): HTMLVideoElement | HTMLImageElement | null =>
    videoMode ? videoRef.current : imgRef.current
  const naturalW = (el: HTMLVideoElement | HTMLImageElement): number =>
    el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth

  const scale = () => {
    const el = mediaEl()
    return el && el.clientWidth && naturalW(el) ? naturalW(el) / el.clientWidth : 1
  }
  const toSrc = (p: Pt): Pt => { const s = scale(); return { x: Math.round(p.x * s), y: Math.round(p.y * s) } }

  const applyBar = useCallback(() => {
    const b = barRef.current
    const el = mediaEl()
    if (b && b.length === 4 && el?.clientWidth && naturalW(el)) {
      const s = scale()
      setBox({ x: b[0] / s, y: b[1] / s, w: b[2] / s, h: b[3] / s })
    } else setBox(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoMode])

  useEffect(() => { setImgSrc((prev) => (imageUrl && imageUrl !== prev ? imageUrl : prev)) }, [imageUrl])
  useEffect(() => { applyBar() }, [frame, bar, applyBar])

  // ── seek fluido: latest-wins ──────────────────────────────────────────
  // Si el <video> está a mitad de un seek, los frames nuevos solo actualizan
  // el objetivo; al llegar 'seeked' se aplica el último pedido. El arrastre
  // del scrubber nunca encola trabajo ni se congela.
  const seekTarget = useRef<number | null>(null)
  const seeking = useRef(false)
  useEffect(() => {
    if (!videoMode) return
    const v = videoRef.current
    if (!v || v.readyState === 0) return
    const t = (frame + 0.5) / fps
    if (seeking.current) {
      seekTarget.current = t
    } else {
      seeking.current = true
      v.currentTime = t
    }
  }, [frame, fps, videoMode])

  const onSeeked = (): void => {
    const v = videoRef.current
    if (!v) return
    const pending = seekTarget.current
    seekTarget.current = null
    if (pending !== null && Math.abs(v.currentTime - pending) > 1e-4) {
      v.currentTime = pending // aplica el último frame pedido durante el seek
    } else {
      seeking.current = false
    }
  }

  const pos = (e: React.MouseEvent) => {
    const r = mediaEl()!.getBoundingClientRect()
    return { x: clamp(e.clientX - r.left, 0, r.width), y: clamp(e.clientY - r.top, 0, r.height) }
  }

  const emitBox = (b: DispBox | null) => {
    if (!b || b.w < 5 || b.h < 5) { onBar(null); return }
    const s = scale()
    onBar({ x: Math.round(b.x * s), y: Math.round(b.y * s), w: Math.round(b.w * s), h: Math.round(b.h * s) })
  }

  // mousedown sobre el lienzo (no sobre caja/manija/punto)
  const onWrapDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const p = pos(e)
    if (active === 'bar') {
      drag.current = { kind: 'draw', ox: p.x, oy: p.y }
      setBox({ x: p.x, y: p.y, w: 0, h: 0 })
    } else {
      // colocar/mover la articulación activa en este punto
      drag.current = { kind: 'joint', joint: active }
      setLiveJoint({ joint: active, x: p.x, y: p.y })
    }
  }
  const onBoxDown = (e: React.MouseEvent) => {
    if (active !== 'bar' || !box) return
    e.preventDefault(); e.stopPropagation()
    const p = pos(e)
    drag.current = { kind: 'move', dx: p.x - box.x, dy: p.y - box.y }
  }
  const onResizeDown = (e: React.MouseEvent, corner: Corner) => {
    if (active !== 'bar' || !box) return
    e.preventDefault(); e.stopPropagation()
    const fx = corner === 'nw' || corner === 'sw' ? box.x + box.w : box.x
    const fy = corner === 'nw' || corner === 'ne' ? box.y + box.h : box.y
    drag.current = { kind: 'resize', fx, fy }
  }
  const onDotDown = (e: React.MouseEvent, j: string) => {
    e.preventDefault(); e.stopPropagation()
    if (j !== active) return                    // solo se arrastra el label activo
    const p = pos(e)
    drag.current = { kind: 'joint', joint: j }
    setLiveJoint({ joint: j, x: p.x, y: p.y })
  }

  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return
    const p = pos(e)
    const d = drag.current
    const el = mediaEl()!
    if (d.kind === 'draw') setBox(rectFrom(d.ox, d.oy, p.x, p.y))
    else if (d.kind === 'resize') setBox(rectFrom(d.fx, d.fy, p.x, p.y))
    else if (d.kind === 'move' && box) {
      setBox({ x: clamp(p.x - d.dx, 0, el.clientWidth - box.w), y: clamp(p.y - d.dy, 0, el.clientHeight - box.h), w: box.w, h: box.h })
    } else if (d.kind === 'joint') {
      setLiveJoint({ joint: d.joint, x: p.x, y: p.y })
    }
  }
  const onUp = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (d.kind === 'joint') {
      setLiveJoint((lj) => { if (lj) onJoint(d.joint, toSrc(lj)); return null })
    } else {
      setBox((b) => { emitBox(b && b.w >= 5 && b.h >= 5 ? b : null); return b })
    }
  }

  const clearBar = () => { setBox(null); onBar(null) }

  // dots a dibujar: las articulaciones del frame, sustituyendo la activa si se arrastra
  const dots = joints.map((j) =>
    liveJoint && liveJoint.joint === j.joint ? null : j,
  ).filter(Boolean) as JointPt[]
  const s = scale()

  const handle = (corner: Corner, cursor: string, st: React.CSSProperties) => (
    <div onMouseDown={(e) => onResizeDown(e, corner)}
      style={{ position: 'absolute', width: 14, height: 14, background: '#c2f542',
        border: '2px solid #0d3238', borderRadius: 3, cursor, ...st }} />
  )
  const dotEl = (j: string, dx: number, dy: number, isLive: boolean, rel: boolean) => {
    const col = jointColor(j)
    const activeDot = j === active
    return (
      <div key={`${j}-${isLive}`} onMouseDown={(e) => onDotDown(e, j)}
        style={{ position: 'absolute', left: dx, top: dy, transform: 'translate(-50%,-50%)',
          width: activeDot ? 16 : 12, height: activeDot ? 16 : 12, borderRadius: '50%',
          background: col, border: rel ? `2px dashed ${col}` : '2px solid #0d1f22',
          cursor: activeDot ? 'grab' : 'default',
          opacity: activeDot ? 1 : 0.7, boxShadow: activeDot ? `0 0 0 2px ${col}55` : 'none' }}>
        <span style={{ position: 'absolute', left: '120%', top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, color: col, whiteSpace: 'nowrap', textShadow: '0 1px 2px #000', pointerEvents: 'none' }}>
          {rel ? '⛓ ' : ''}{jointLabel(j)}
        </span>
      </div>
    )
  }

  return (
    <div>
      <div className="gv-seed-wrap" style={{ position: 'relative', userSelect: 'none', cursor: 'crosshair' }}
        onMouseDown={onWrapDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
        {videoMode ? (
          <video
            ref={videoRef}
            className="gv-seed-img"
            src={videoUrl!}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={() => {
              // posiciona el primer frame pedido y recalibra la caja
              const v = videoRef.current
              if (v) { seeking.current = true; v.currentTime = (frame + 0.5) / fps }
              applyBar()
            }}
            onSeeked={onSeeked}
            onError={() => setVideoFailed(true)} // códec no soportado → JPEG
            style={{ display: 'block', width: '100%' }}
          />
        ) : (
          <img ref={imgRef} className="gv-seed-img" src={imgSrc} alt="frame" draggable={false}
            decoding="sync" onLoad={applyBar} style={{ display: 'block', width: '100%' }} />
        )}

        {/* caja de la barra */}
        {box && (
          <div className="gv-seed-box" onMouseDown={onBoxDown}
            style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h,
              display: 'block', cursor: active === 'bar' ? 'move' : 'default', boxSizing: 'border-box',
              opacity: active === 'bar' ? 1 : 0.45 }}>
            {active === 'bar' && <>
              {handle('nw', 'nwse-resize', { left: -7, top: -7 })}
              {handle('ne', 'nesw-resize', { right: -7, top: -7 })}
              {handle('sw', 'nesw-resize', { left: -7, bottom: -7 })}
              {handle('se', 'nwse-resize', { right: -7, bottom: -7 })}
            </>}
          </div>
        )}

        {/* puntos de articulación */}
        {dots.map((j) => dotEl(j.joint, j.x / s, j.y / s, false, !!j.rel_bar))}
        {liveJoint && dotEl(liveJoint.joint, liveJoint.x, liveJoint.y, true, false)}
      </div>

      <div className="gv-seed-read" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {active === 'bar' ? (
          <>
            <span>{box && box.w >= 5 ? `placa: ${Math.round(box.w * s)}×${Math.round(box.h * s)} px` : 'arrastra sobre el disco'}</span>
            {box && <button onClick={clearBar} style={clearBtn}>Limpiar</button>}
          </>
        ) : (
          <span>{joints.find((j) => j.joint === active)
            ? `${jointLabel(active)} marcada — arrástrala para ajustar`
            : `click para marcar ${jointLabel(active)} en este frame`}</span>
        )}
      </div>
    </div>
  )
}

const clearBtn: React.CSSProperties = { background: 'transparent', border: '1px solid #ffffff33', color: '#fff', borderRadius: 6, padding: '2px 10px', cursor: 'pointer', fontSize: 12 }
