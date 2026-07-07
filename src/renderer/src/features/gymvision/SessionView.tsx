import { useEffect, useRef, useState } from 'react'
import { ZONE_LABEL } from './api'
import type { SessionDetail } from './api'

const n = (v: number | null, d = 2) => (v === null || v === undefined ? '—' : v.toFixed(d))

type MeterState = 'norm' | 'hot' | 'fire' | 'broken'

// Cuánto headroom deja el auto-reescalado por encima del pico visto hasta
// ahora — como un osciloscopio auto-rango: al superar el techo, el techo
// sube con él (+12%), así la aguja nunca queda pegada al final por el resto
// del video; solo se acerca a él de nuevo si sigues acelerando.
const AUTORANGE_HEADROOM = 1.12

/** Telemetría en vivo bajo el video: contador de reps completadas y
 *  velocímetro EN VIVO — la aguja sigue la velocidad instantánea del plato
 *  frame a frame (`velocity_series`, la misma curva EMA que dibuja el HUD del
 *  video), interpolada a 60fps con rAF. Sube y baja con el movimiento real.
 *
 *  El techo del medidor se AUTO-REESCALA (estilo osciloscopio): arranca en tu
 *  MÁXIMO HISTÓRICO del ejercicio, pero si esta serie lo supera, el techo
 *  sube con el nuevo pico + 12% de aire — así la aguja no se queda clavada al
 *  100% el resto del video. El festejo de "medidor roto" (grieta + esquirla)
 *  se dispara una sola vez, exactamente al cruzar el máximo histórico REAL
 *  (no el techo reescalado), y queda latcheado como celebración visual. */
function RepPlayback({ session, videoRef, historicalMax }: {
  session: SessionDetail
  videoRef: React.RefObject<HTMLVideoElement | null>
  historicalMax?: number | null
}) {
  const fps = session.fps ?? 30
  const reps = session.reps.filter((r) => r.frame_end != null && r.velocity_mean != null)
  const series = session.velocity_series ?? []
  const [t, setT] = useState(0)
  const [brokenAt, setBrokenAt] = useState<number | null>(null) // latch del récord
  const peakLiveRef = useRef(0) // mayor velocidad RAW vista en este playback (para el auto-rango)

  // reloj del playback: rAF mientras reproduce + seek/pause directos
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let raf = 0
    const tick = (): void => { setT(v.currentTime); raf = requestAnimationFrame(tick) }
    const start = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick) }
    const stop = (): void => { cancelAnimationFrame(raf); setT(v.currentTime) }
    v.addEventListener('play', start)
    v.addEventListener('pause', stop)
    v.addEventListener('seeked', stop)
    return () => {
      cancelAnimationFrame(raf)
      v.removeEventListener('play', start)
      v.removeEventListener('pause', stop)
      v.removeEventListener('seeked', stop)
    }
  }, [videoRef])

  if (reps.length === 0 && series.length === 0) return null // sesión vieja sin datos

  // velocidad instantánea en t, interpolada entre frames (fluida a 60fps)
  const f = t * fps
  const i0 = Math.max(0, Math.min(series.length - 1, Math.floor(f)))
  const i1 = Math.min(series.length - 1, i0 + 1)
  const live = series.length ? series[i0] + (series[i1] - series[i0]) * (f - i0) : 0

  const done = reps.filter((r) => r.frame_end! / fps <= t)
  const inRep = reps.some((r) => r.frame_start! / fps <= t && t <= r.frame_end! / fps)
  // referencia FIJA: tu mejor velocidad PICO histórica en el ejercicio (misma
  // base instantánea que `live` — comparar contra una media haría que la
  // aguja pegara siempre al tope). Sin historia, el pico de la propia sesión.
  const limit = historicalMax
    ?? (reps.length ? Math.max(...reps.map((r) => r.velocity_peak ?? r.velocity_mean!)) : Math.max(...series, 0.01))

  // reset al volver al inicio del video
  if (t < 0.25) {
    peakLiveRef.current = 0
    if (brokenAt !== null) setBrokenAt(null)
  } else {
    peakLiveRef.current = Math.max(peakLiveRef.current, live)
    if (live > limit && brokenAt === null) setBrokenAt(live)
  }

  // techo efectivo del medidor: el histórico, o el pico de ESTA sesión + aire
  // si ya lo pasó — así, tras la rotura, la aguja vuelve a tener a dónde subir
  // en vez de quedar pegada al 100% el resto del video.
  const ceiling = Math.max(limit, peakLiveRef.current * AUTORANGE_HEADROOM)
  const frac = ceiling > 0 ? live / ceiling : 0
  const peakFrac = ceiling > 0 ? peakLiveRef.current / ceiling : 0

  const state: MeterState = brokenAt !== null ? 'broken'
    : frac >= 0.97 ? 'fire' : frac >= 0.85 ? 'hot' : 'norm'

  return (
    <div className={`gv-rp ${state}${inRep ? ' live' : ''}`}>
      <div className="gv-rp-reps">
        <span className="gv-rp-big">{done.length}<i>/{reps.length}</i></span>
        <span className="gv-rp-lbl">{inRep ? '● REP EN CURSO' : 'REPS COMPLETADAS'}</span>
      </div>

      <div className="gv-rp-meter-wrap">
        <div className="gv-rp-meter-head">
          <span>VEL <b className="gv-rp-vnum">{live.toFixed(2)}</b> m/s</span>
          <span className="gv-rp-limit">MÁX HIST {limit.toFixed(2)}</span>
        </div>
        <div className="gv-rp-meter">
          <div className="gv-rp-fill" style={{ width: `${Math.min(100, frac * 100)}%` }} />
          {/* aguja de pico: lo más rápido que ha ido ESTE playback */}
          {peakFrac > 0.02 && (
            <div className="gv-rp-peak" style={{ left: `${Math.min(99, peakFrac * 100)}%` }} />
          )}
          {(state === 'fire' || state === 'broken') && frac > 0.9 && (
            <div className="gv-rp-sparks" style={{ left: `${Math.min(98, frac * 100)}%` }}>
              <span /><span /><span />
            </div>
          )}
          {/* marca del máximo histórico real sobre el techo reescalado —
              tras un PR queda a la izquierda del final, mostrando cuánto te
              sacaste de ventaja */}
          <div className="gv-rp-tick" title="tu máximo histórico"
            style={{ left: `${Math.min(100, (limit / ceiling) * 100)}%` }} />
          {state === 'broken' && (
            <>
              <div className="gv-rp-crack" />
              <div className="gv-rp-shard" />
            </>
          )}
        </div>
        {state === 'broken' && (
          <div className="gv-rp-record">▓ MEDIDOR ROTO — SUPERASTE TU MÁXIMO ({brokenAt!.toFixed(2)} m/s) ▓</div>
        )}
      </div>
    </div>
  )
}

/** Preview del video analizado (con el HUD dibujado) + telemetría en vivo +
 *  desglose rico. Presentacional: recibe el detalle. */
export function SessionView({ session, historicalMax }: {
  session: SessionDetail
  historicalMax?: number | null
}) {
  const s = session.summary
  const media = session.annotated_url ?? session.video_url
  const hasAngles = session.reps.some((r) => r.knee_angle_bottom != null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  return (
    <div className="gv-detail gv-reveal">
      {/* preview de video + telemetría sincronizada */}
      <div>
        {media ? (
          <>
            {/* key fuerza recarga si cambia la fuente */}
            <video key={media} ref={videoRef} className="gv-video" src={media} controls playsInline preload="metadata" />
            <RepPlayback session={session} videoRef={videoRef} historicalMax={historicalMax} />
            <div className="gv-vcap">
              {session.annotated_url ? 'video anotado · HUD de la barra dibujado' : 'video original (sin anotar aún)'}
            </div>
          </>
        ) : (
          <div className="gv-noanno">Sin video disponible.</div>
        )}
      </div>

      {/* métricas + reps */}
      <div>
        <div className="gv-dmetrics">
          <div className="gv-dm"><div className="gv-dmt">V. media</div>
            <div className="gv-dmv">{n(s.mean_velocity)}<span className="gv-dmu"> m/s</span></div></div>
          <div className="gv-dm"><div className="gv-dmt">V. pico</div>
            <div className="gv-dmv">{n(s.best_velocity)}<span className="gv-dmu"> m/s</span></div></div>
          <div className="gv-dm"><div className="gv-dmt">Pérdida vel.</div>
            <div className="gv-dmv">{s.velocity_loss_pct != null ? `${s.velocity_loss_pct}%` : '—'}</div></div>
          <div className="gv-dm"><div className="gv-dmt">1RM est.</div>
            <div className="gv-dmv">{s.best_1rm != null ? <>{s.best_1rm}<span className="gv-dmu"> kg</span></> : '—'}</div></div>
        </div>

        {session.reps.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="gv-reps">
              <thead>
                <tr>
                  <th>#</th><th>V.med</th><th>V.pic</th><th>Pérd</th><th>Conc</th>
                  {hasAngles && <><th>Rod</th><th>Cad</th><th>Tor</th></>}
                  <th>Zona</th>
                </tr>
              </thead>
              <tbody>
                {session.reps.map((r) => (
                  <tr key={r.number}>
                    <td className="gv-rn">{r.number}</td>
                    <td>{n(r.velocity_mean)}</td>
                    <td>{n(r.velocity_peak)}</td>
                    <td>{r.velocity_loss_pct != null ? `${r.velocity_loss_pct}%` : '—'}</td>
                    <td>{r.time_concentric != null ? `${r.time_concentric.toFixed(2)}s` : '—'}</td>
                    {hasAngles && <>
                      <td>{r.knee_angle_bottom != null ? `${Math.round(r.knee_angle_bottom)}°` : '—'}</td>
                      <td>{r.hip_angle_bottom != null ? `${Math.round(r.hip_angle_bottom)}°` : '—'}</td>
                      <td>{r.torso_angle_bottom != null ? `${Math.round(r.torso_angle_bottom)}°` : '—'}</td>
                    </>}
                    <td>{r.training_zone
                      ? <span className={`gv-zb z-${r.training_zone}`}>{ZONE_LABEL[r.training_zone] ?? r.training_zone}</span>
                      : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="gv-noanno">Sin reps detectadas todavía.</div>
        )}
      </div>
    </div>
  )
}
