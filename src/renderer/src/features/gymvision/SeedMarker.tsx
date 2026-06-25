import { useRef, useState, useEffect, useCallback } from 'react'
import type { Bbox } from './api'

type DispBox = { x: number; y: number; w: number; h: number }
type Corner = 'nw' | 'ne' | 'sw' | 'se'
type Drag =
  | { kind: 'draw'; ox: number; oy: number }
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'resize'; fx: number; fy: number }
  | null

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi))
const rectFrom = (ax: number, ay: number, bx: number, by: number): DispBox => ({
  x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(ax - bx), h: Math.abs(ay - by),
})

/** Editor de caja sobre el frame actual (modo IMAGEN: frames exactos del backend).
 *  El padre cambia `frame`; este resuelve la imagen (getImageUrl/imageUrl) y la caja
 *  inicial (getInitial). Emite el bbox en coordenadas del VIDEO original. */
export function SeedMarker({ frame, imageUrl, getImageUrl, getInitial, onChange, loading }: {
  frame: number
  imageUrl?: string
  getImageUrl?: (frame: number) => string
  getInitial: (frame: number) => number[] | null
  onChange: (b: Bbox | null) => void
  loading?: boolean
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const drag = useRef<Drag>(null)
  // refs para que los efectos no dependan de funciones nuevas en cada render
  const getInitialRef = useRef(getInitial)
  const getImageRef = useRef(getImageUrl)
  getInitialRef.current = getInitial
  getImageRef.current = getImageUrl
  const [box, setBox] = useState<DispBox | null>(null)
  const [imgSrc, setImgSrc] = useState(() => getImageUrl?.(frame) ?? imageUrl ?? '')

  const scale = () => {
    const el = imgRef.current
    return el && el.clientWidth && el.naturalWidth ? el.naturalWidth / el.clientWidth : 1
  }

  const applyForFrame = useCallback((n: number) => {
    const initial = getInitialRef.current(n)
    const el = imgRef.current
    if (initial && initial.length === 4 && el?.clientWidth && el.naturalWidth) {
      const s = scale()
      setBox({ x: initial[0] / s, y: initial[1] / s, w: initial[2] / s, h: initial[3] / s })
    } else {
      setBox(null)
    }
  }, [])

  // Cambiar la imagen al cambiar de frame; el box se recalcula en onLoad.
  useEffect(() => {
    const url = getImageRef.current?.(frame) ?? imageUrl ?? ''
    setImgSrc((prev) => (url && url !== prev ? url : prev))
  }, [frame, imageUrl])

  const emit = (b: DispBox | null) => {
    if (!b || b.w < 5 || b.h < 5) { onChange(null); return }
    const s = scale()
    onChange({ x: Math.round(b.x * s), y: Math.round(b.y * s), w: Math.round(b.w * s), h: Math.round(b.h * s) })
  }

  const pos = (e: React.MouseEvent) => {
    const r = imgRef.current!.getBoundingClientRect()
    return { x: clamp(e.clientX - r.left, 0, r.width), y: clamp(e.clientY - r.top, 0, r.height) }
  }

  const startDraw = (e: React.MouseEvent) => {
    e.preventDefault()
    const p = pos(e)
    drag.current = { kind: 'draw', ox: p.x, oy: p.y }
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  const startMove = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (!box) return
    const p = pos(e)
    drag.current = { kind: 'move', dx: p.x - box.x, dy: p.y - box.y }
  }
  const startResize = (e: React.MouseEvent, corner: Corner) => {
    e.preventDefault(); e.stopPropagation()
    if (!box) return
    const fx = corner === 'nw' || corner === 'sw' ? box.x + box.w : box.x
    const fy = corner === 'nw' || corner === 'ne' ? box.y + box.h : box.y
    drag.current = { kind: 'resize', fx, fy }
  }

  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return
    const p = pos(e)
    const d = drag.current
    const el = imgRef.current!
    if (d.kind === 'draw') setBox(rectFrom(d.ox, d.oy, p.x, p.y))
    else if (d.kind === 'resize') setBox(rectFrom(d.fx, d.fy, p.x, p.y))
    else if (d.kind === 'move' && box) {
      setBox({
        x: clamp(p.x - d.dx, 0, el.clientWidth - box.w),
        y: clamp(p.y - d.dy, 0, el.clientHeight - box.h),
        w: box.w, h: box.h,
      })
    }
  }
  const onUp = () => {
    if (!drag.current) return
    drag.current = null
    setBox((b) => { if (b && b.w >= 5 && b.h >= 5) emit(b); else emit(null); return b })
  }

  const clear = () => { setBox(null); onChange(null) }

  const handle = (corner: Corner, cursor: string, style: React.CSSProperties) => (
    <div
      onMouseDown={(e) => startResize(e, corner)}
      style={{ position: 'absolute', width: 14, height: 14, background: '#c2f542',
        border: '2px solid #0d3238', borderRadius: 3, cursor, ...style }}
    />
  )

  return (
    <div>
      <p className="gv-seed-hint">
        Encuadra <b>solo la placa</b> (sin rack, pared ni cuerpo). Arrastra en vacío para dibujar,
        mueve desde el centro, y <b>ajusta las esquinas</b> para apretar al borde del disco.
      </p>
      <div
        className="gv-seed-wrap"
        style={{ position: 'relative', userSelect: 'none', cursor: 'crosshair' }}
        onMouseDown={startDraw}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      >
        <img
          ref={imgRef}
          className="gv-seed-img"
          src={imgSrc}
          alt="frame"
          draggable={false}
          decoding="sync"
          onLoad={() => applyForFrame(frame)}
          style={{ opacity: loading ? 0.72 : 1, display: 'block', width: '100%' }}
        />
        {box && (
          <div
            className="gv-seed-box"
            onMouseDown={startMove}
            style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h,
              display: 'block', cursor: 'move', boxSizing: 'border-box' }}
          >
            {handle('nw', 'nwse-resize', { left: -7, top: -7 })}
            {handle('ne', 'nesw-resize', { right: -7, top: -7 })}
            {handle('sw', 'nesw-resize', { left: -7, bottom: -7 })}
            {handle('se', 'nwse-resize', { right: -7, bottom: -7 })}
          </div>
        )}
      </div>
      <div className="gv-seed-read" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>
          {box && box.w >= 5
            ? `placa: ${Math.round(box.w * scale())}×${Math.round(box.h * scale())} px`
            : 'sin marcar — arrastra sobre el disco'}
        </span>
        {box && (
          <button onClick={clear}
            style={{ background: 'transparent', border: '1px solid #ffffff33', color: '#fff',
              borderRadius: 6, padding: '2px 10px', cursor: 'pointer', fontSize: 12 }}>
            Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
