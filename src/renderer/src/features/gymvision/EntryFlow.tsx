import { useEffect, useRef, useState } from 'react'
import { Film, Upload, Cpu, Check } from 'lucide-react'
import { gv, type Bbox, type Exercise, type SessionDetail } from './api'
import { SeedMarker } from './SeedMarker'
import { SessionView } from './SessionView'

type Step = 'details' | 'seed' | 'processing' | 'done'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PROC_MSGS = [
  'Extrayendo frames del video…',
  'Estimando pose y rastreando la barra…',
  'Detectando repeticiones…',
  'Calculando velocidad y ángulos…',
  'Dibujando el path de la barra…',
]

export function EntryFlow({ prefillDate, onClose, onComplete }: {
  prefillDate?: string | null
  onClose: () => void
  onComplete: (session: SessionDetail) => void
}) {
  const [step, setStep] = useState<Step>('details')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [exercise, setExercise] = useState('')
  const [weight, setWeight] = useState('')
  const [date, setDate] = useState(prefillDate || todayStr())
  const [pose, setPose] = useState('mediapipe')
  const [plate, setPlate] = useState('0.45')
  const [videoPath, setVideoPath] = useState('')
  const [videoName, setVideoName] = useState('')
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [seed, setSeed] = useState<Bbox | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [procMsg, setProcMsg] = useState(PROC_MSGS[0])
  const procTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    void gv.exercises().then((r) => {
      const list = r.data ?? []
      setExercises(list)
      if (list.length) setExercise(list[0].slug)
    })
  }, [])

  // rotación de mensajes durante el procesamiento (puramente cosmético)
  useEffect(() => {
    if (step !== 'processing') return
    let i = 0
    procTimer.current = setInterval(() => {
      i = (i + 1) % PROC_MSGS.length
      setProcMsg(PROC_MSGS[i])
    }, 2200)
    return () => { if (procTimer.current) clearInterval(procTimer.current) }
  }, [step])

  const pickVideo = async () => {
    const r = await gv.pickVideo()
    if (r.ok && r.data) { setVideoPath(r.data.path); setVideoName(r.data.name); setError(null) }
  }

  const canContinue = exercise && Number(weight) > 0 && videoPath

  const createAndNext = async () => {
    setError(null)
    setBusy(true)
    const r = await gv.createSession({
      exercise, date, weight_kg: Number(weight), pose_engine: pose,
      video_path: videoPath, plate_diameter_m: Number(plate) || undefined,
    })
    setBusy(false)
    if (!r.ok || !r.data) { setError(r.error === 'offline' ? 'GymVision no responde.' : (r.error ?? 'Error al crear')); return }
    setSession(r.data)
    setStep('seed')
  }

  const process = async () => {
    if (!session) return
    setError(null)
    if (seed) await gv.saveSeed(session.id, seed)
    setStep('processing')
    const r = await gv.analyze(session.id)
    if (!r.ok || !r.data) {
      setError(r.error === 'offline' ? 'El análisis tardó demasiado o el server cayó.' : (r.error ?? 'Análisis falló'))
      setStep('seed')
      return
    }
    setSession(r.data)
    setStep('done')
  }

  const stepIndex = step === 'details' ? 0 : step === 'done' ? 2 : 1

  return (
    <div className="gv-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && step !== 'processing') onClose() }}>
      <div className="gv-sheet" role="dialog" aria-modal="true">
        <div className="gv-sheet-head">
          <b>
            {step === 'details' && 'Nueva entrada'}
            {step === 'seed' && 'Marcar la barra'}
            {step === 'processing' && 'Procesando'}
            {step === 'done' && 'Desglose'}
          </b>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="gv-stepn">PASO {stepIndex + 1}/3</span>
            {step !== 'processing' && <button className="gv-close" onClick={onClose} aria-label="cerrar">×</button>}
          </div>
        </div>

        <div className="gv-steps">
          <i className={stepIndex > 0 ? 'done' : 'on'} />
          <i className={stepIndex > 1 ? 'done' : stepIndex === 1 ? 'on' : ''} />
          <i className={stepIndex === 2 ? 'on' : ''} />
        </div>

        <div className="gv-sheet-body">
          {error && <div className="gv-err" style={{ marginBottom: 14 }}>{error}</div>}

          {step === 'details' && (
            <div className="gv-form">
              <div className="gv-fgrid">
                <div className="gv-field">
                  <span className="gv-flabel">Ejercicio</span>
                  <select className="gv-select" value={exercise} onChange={(e) => setExercise(e.target.value)}>
                    {exercises.map((ex) => <option key={ex.slug} value={ex.slug}>{ex.name}</option>)}
                  </select>
                </div>
                <div className="gv-field">
                  <span className="gv-flabel">Fecha</span>
                  <input className="gv-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ minWidth: 0 }} />
                </div>
                <div className="gv-field">
                  <span className="gv-flabel">Peso (kg)</span>
                  <input className="gv-input" inputMode="decimal" placeholder="80" value={weight}
                    onChange={(e) => setWeight(e.target.value)} style={{ minWidth: 0 }} />
                </div>
                <div className="gv-field">
                  <span className="gv-flabel">Motor de pose</span>
                  <select className="gv-select" value={pose} onChange={(e) => setPose(e.target.value)}>
                    <option value="mediapipe">MediaPipe</option>
                    <option value="yolo">YOLOv8-Pose</option>
                    <option value="">Sin pose (solo barra)</option>
                  </select>
                </div>
                <div className="gv-field">
                  <span className="gv-flabel">Ø disco (m)</span>
                  <input className="gv-input" inputMode="decimal" value={plate}
                    onChange={(e) => setPlate(e.target.value)} style={{ minWidth: 0 }} />
                </div>
              </div>

              <div className={`gv-filepick${videoPath ? ' ok' : ''}`} onClick={() => void pickVideo()}>
                <span className="gv-fp-ic">{videoPath ? <Film size={18} /> : <Upload size={18} />}</span>
                <div style={{ overflow: 'hidden' }}>
                  <div className="gv-fp-tx">{videoName || 'Adjuntar video de la serie'}</div>
                  <div className="gv-fp-sub">{videoPath ? 'click para cambiar' : 'mov · mp4 · m4v · avi'}</div>
                </div>
              </div>

              <div className="gv-actions">
                <button className="gv-btn" style={{ background: 'transparent', color: '#fff' }} onClick={onClose}>Cancelar</button>
                <button className="gv-cta" onClick={() => void createAndNext()} disabled={!canContinue || busy}>
                  {busy ? 'Subiendo…' : 'Continuar →'}
                </button>
              </div>
            </div>
          )}

          {step === 'seed' && session && (
            <div>
              {session.first_frame_url
                ? <SeedMarker frame={0} imageUrl={session.first_frame_url} getInitial={() => session.bar_seed} onChange={setSeed} />
                : <div className="gv-noanno">No se pudo cargar el primer frame.</div>}
              <div className="gv-actions" style={{ marginTop: 18 }}>
                <button className="gv-btn" style={{ background: 'transparent', color: '#fff' }} onClick={() => void process()}>
                  Saltar marcado
                </button>
                <button className="gv-cta" onClick={() => void process()}>
                  <Cpu size={16} /> {seed ? 'Procesar con barra' : 'Procesar'}
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="gv-proc">
              <div className="gv-proc-ring" />
              <div className="gv-proc-t">Analizando video</div>
              <div className="gv-proc-s">{procMsg}</div>
              <div className="gv-proc-scan" />
              <div className="gv-proc-s" style={{ opacity: .5 }}>Esto puede tardar — la visión por computador es pesada.</div>
            </div>
          )}

          {step === 'done' && session && (
            <div>
              <SessionView session={session} />
              {/* Loop de re-calibración: tras ver las anotaciones, volver a marcar
                  la barra y re-analizar la MISMA sesión (saveSeed + analyze son
                  idempotentes). Útil cuando el primer intento descalibró por un
                  seed flojo o un frame inicial no representativo. */}
              <div className="gv-actions" style={{ marginTop: 18, justifyContent: 'space-between' }}>
                <button className="gv-btn" style={{ background: 'transparent', color: '#fff' }}
                  onClick={() => { setError(null); setStep('seed') }}>
                  ↺ Re-ajustar barra
                </button>
                <button className="gv-cta" onClick={() => { onComplete(session); onClose() }}>
                  <Check size={16} /> Listo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
