import { ZONE_LABEL } from './api'
import type { SessionDetail } from './api'

const n = (v: number | null, d = 2) => (v === null || v === undefined ? '—' : v.toFixed(d))

/** Preview del video analizado (con el path de la barra dibujado) + desglose
 *  rico de la información recolectada. Presentacional: recibe el detalle. */
export function SessionView({ session }: { session: SessionDetail }) {
  const s = session.summary
  const media = session.annotated_url ?? session.video_url
  const hasAngles = session.reps.some((r) => r.knee_angle_bottom != null)

  return (
    <div className="gv-detail gv-reveal">
      {/* preview de video */}
      <div>
        {media ? (
          <>
            {/* key fuerza recarga si cambia la fuente */}
            <video key={media} className="gv-video" src={media} controls playsInline preload="metadata" />
            <div className="gv-vcap">
              {session.annotated_url ? 'video anotado · path de la barra dibujado' : 'video original (sin anotar aún)'}
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
