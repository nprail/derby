import { useState, useEffect, useRef } from 'react'

const LANE_PALETTES = {
  Red: {
    bg: '#1a0808',
    border: '#dc2626',
    text: '#fca5a5',
    glow: 'rgba(220,38,38,0.4)',
    dot: '#ef4444',
  },
  Blue: {
    bg: '#08101a',
    border: '#2563eb',
    text: '#93c5fd',
    glow: 'rgba(37,99,235,0.4)',
    dot: '#3b82f6',
  },
  Yellow: {
    bg: '#1a1608',
    border: '#ca8a04',
    text: '#fde68a',
    glow: 'rgba(202,138,4,0.4)',
    dot: '#eab308',
  },
  Green: {
    bg: '#081a0c',
    border: '#16a34a',
    text: '#86efac',
    glow: 'rgba(22,163,74,0.4)',
    dot: '#22c55e',
  },
  Purple: {
    bg: '#110818',
    border: '#9333ea',
    text: '#d8b4fe',
    glow: 'rgba(147,51,234,0.4)',
    dot: '#a855f7',
  },
  Orange: {
    bg: '#1a0e08',
    border: '#ea580c',
    text: '#fed7aa',
    glow: 'rgba(234,88,12,0.4)',
    dot: '#f97316',
  },
  Pink: {
    bg: '#1a0812',
    border: '#db2777',
    text: '#fbcfe8',
    glow: 'rgba(219,39,119,0.4)',
    dot: '#ec4899',
  },
  White: {
    bg: '#141418',
    border: '#d1d5db',
    text: '#f9fafb',
    glow: 'rgba(209,213,219,0.4)',
    dot: '#e5e7eb',
  },
}

const PLACE_LABELS = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH']
// Step size in seconds for frame-by-frame (approx 1 frame at 30 fps)
const FRAME_STEP = 1 / 30

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

function LaneOrderCard({ lane, place, laneColors, canMoveUp, canMoveDown, onMoveUp, onMoveDown }) {
  const colorName = laneColors[lane] || 'White'
  const palette = LANE_PALETTES[colorName] || LANE_PALETTES.White
  const isFirst = place === 0

  return (
    <div
      className="relative rounded-2xl border-2 overflow-hidden"
      style={{
        background: palette.bg,
        borderColor: isFirst ? palette.border : palette.border + '80',
        boxShadow: isFirst
          ? `0 0 24px ${palette.glow}, 0 0 48px ${palette.glow}40`
          : `0 0 12px ${palette.glow}40`,
      }}
    >
      {/* Track stripe texture */}
      <div className="track-stripe absolute inset-0 pointer-events-none" />

      <div className="relative flex items-center gap-3 px-4 py-4">
        {/* Place label */}
        <div
          className="font-display text-3xl w-14 text-center flex-shrink-0 leading-none"
          style={{ color: palette.text }}
        >
          {PLACE_LABELS[place]}
        </div>

        {/* Divider */}
        <div className="w-px self-stretch opacity-30" style={{ background: palette.border }} />

        {/* Lane info */}
        <div className="flex-1 min-w-0">
          <div
            className="font-condensed text-xs font-semibold opacity-40 uppercase tracking-widest"
            style={{ color: palette.text }}
          >
            Lane {lane}
          </div>
          <div className="font-display text-2xl leading-tight" style={{ color: palette.text }}>
            {colorName}
          </div>
        </div>

        {isFirst && <div className="text-xl flex-shrink-0">🏆</div>}

        {/* Reorder buttons — large touch targets */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-base font-condensed transition active:scale-95 disabled:opacity-20"
            style={{
              color: palette.text,
              background: canMoveUp ? palette.border + '25' : 'transparent',
            }}
            title="Move up"
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-base font-condensed transition active:scale-95 disabled:opacity-20"
            style={{
              color: palette.text,
              background: canMoveDown ? palette.border + '25' : 'transparent',
            }}
            title="Move down"
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  )
}

// ── History card ──────────────────────────────────────────────────────────────
// Renders one row — used inside a rounded-xl overflow-hidden container
function HistoryRow({ entry, laneColors, isLast }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 ${!isLast ? 'border-b border-white/5' : ''}`}
    >
      <span className="font-condensed text-xs text-white/30 w-14 flex-shrink-0">
        Heat {entry.heat}
      </span>
      <div className="flex gap-1.5 flex-wrap flex-1">
        {entry.finishOrder.map((item, idx) => {
          const colorName = laneColors[item.lane] || 'White'
          const palette = LANE_PALETTES[colorName] || LANE_PALETTES.White
          return (
            <span
              key={item.lane}
              className="font-condensed text-xs px-2 py-0.5 rounded"
              style={{
                background: palette.bg,
                color: palette.text,
                border: `1px solid ${palette.border}50`,
              }}
            >
              {idx + 1}. {colorName}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function App() {
  const [wsState, setWsState] = useState(null)
  // phase: 'idle' | 'recording' | 'review'
  const [phase, setPhase] = useState('idle')
  const [playbackUrl, setPlaybackUrl] = useState(null)
  const [orderedLanes, setOrderedLanes] = useState([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null) // null | 'ok' | 'error'
  const [recordError, setRecordError] = useState(null)

  const playbackRef = useRef(null)
  const wsRef = useRef(null)

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function connect() {
      const ws = new WebSocket(`ws://${location.host}`)
      wsRef.current = ws
      ws.onmessage = (e) => setWsState(JSON.parse(e.data).state)
      ws.onclose = () => setTimeout(connect, 2000)
    }
    connect()
    return () => wsRef.current?.close()
  }, [])

  // ── Initialize lane order from server state ────────────────────────────────
  useEffect(() => {
    if (wsState) {
      setOrderedLanes(Array.from({ length: wsState.numLanes }, (_, i) => i + 1))
    }
  }, [wsState?.numLanes])

  // ── Load playback clip when entering review mode ───────────────────────────
  useEffect(() => {
    if (phase === 'review' && playbackUrl && playbackRef.current) {
      playbackRef.current.load()
    }
  }, [phase, playbackUrl])

  // ── Recording via ZCam ─────────────────────────────────────────────────────
  async function startRecording() {
    if (phase !== 'idle') return
    setRecordError(null)
    setPlaybackUrl(null)
    setIsPlaying(false)
    setSendResult(null)
    setPhase('recording')

    try {
      const r = await fetch('/api/judge-record', { method: 'POST' })
      const data = await r.json()
      if (!r.ok || !data.ok) {
        setRecordError(data.error || 'Recording failed.')
        setPhase('idle')
        return
      }
      setPlaybackUrl(data.videoUrl)
      setPhase('review')
    } catch (err) {
      setRecordError('Could not reach the recording service — ' + (err.message || 'network error'))
      setPhase('idle')
    }
  }

  function recordAgain() {
    setPhase('idle')
    setPlaybackUrl(null)
    setIsPlaying(false)
    setRecordError(null)
    setSendResult(null)
  }

  // ── Playback controls ──────────────────────────────────────────────────────
  function togglePlay() {
    const v = playbackRef.current
    if (!v) return
    if (v.paused) {
      v.play()
    } else {
      v.pause()
    }
  }

  function restartPlayback() {
    const v = playbackRef.current
    if (!v) return
    v.currentTime = 0
    v.play()
  }

  function stepForward() {
    const v = playbackRef.current
    if (!v) return
    v.pause()
    const max = isNaN(v.duration) ? Infinity : v.duration
    v.currentTime = Math.min(max, v.currentTime + FRAME_STEP)
  }

  function stepBack() {
    const v = playbackRef.current
    if (!v) return
    v.pause()
    v.currentTime = Math.max(0, v.currentTime - FRAME_STEP)
  }

  // ── Finish order ───────────────────────────────────────────────────────────
  function moveUp(idx) {
    if (idx === 0) return
    setOrderedLanes((prev) => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveDown(idx) {
    setOrderedLanes((prev) => {
      if (idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  // ── Send results ───────────────────────────────────────────────────────────
  async function sendResults() {
    if (orderedLanes.length === 0 || sending) return
    setSending(true)
    setSendResult(null)
    try {
      const finishOrder = orderedLanes.map((lane) => ({ lane, gapMs: 0 }))
      const r = await api('/api/judge-result', { finishOrder })
      setSendResult(r.ok ? 'ok' : 'error')
    } catch (_e) {
      setSendResult('error')
    } finally {
      setSending(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!wsState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="font-display text-2xl text-white/20 tracking-widest">CONNECTING…</div>
      </div>
    )
  }

  const { laneColors, heat, zcamEnabled, history = [] } = wsState

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/10 bg-black/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div>
          <div className="font-display text-3xl tracking-widest text-white leading-none">
            JUDGE ASSIST
          </div>
          <div className="font-condensed text-xs tracking-widest uppercase text-white/30 mt-0.5">
            Manual Finish Review
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="font-condensed text-xs text-white/30">
            Heat{' '}
            <span className="font-display text-xl text-white">{heat}</span>
          </div>
          <a
            href="/manage"
            className="h-9 flex items-center px-3 rounded-lg border border-white/10 font-condensed text-xs uppercase tracking-widest text-white/40 hover:text-white hover:border-white/30 hover:bg-white/5 transition"
          >
            Manager
          </a>
        </div>
      </header>

      {/* ── Two-column body (lg+) / single-column (mobile + tablet) ────────── */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-5 lg:grid lg:grid-cols-[3fr_2fr] lg:gap-6 lg:items-start">

        {/* ── LEFT: ZCam / Video + playback controls ────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="font-condensed text-xs uppercase tracking-widest text-white/30 flex items-center gap-2">
            {phase === 'review' ? 'Recorded Clip' : 'ZCam E2M4'}
            {zcamEnabled && phase !== 'review' && (
              <span className="font-condensed text-xs text-green-400">● connected</span>
            )}
            {!zcamEnabled && phase === 'idle' && (
              <span className="font-condensed text-xs text-yellow-500/70">● not configured</span>
            )}
          </div>

          {/* Video container — 60vh on mobile, full column height on tablet */}
          <div
            className="rounded-2xl overflow-hidden border border-white/10 relative w-full"
            style={{
              background: '#060608',
              ...(phase === 'review'
                ? {
                    height: '60vh',
                    minHeight: '220px',
                  }
                : { aspectRatio: '16/9' }),
            }}
          >
            {/* Recorded clip playback (shown in review phase) */}
            <video
              ref={playbackRef}
              src={phase === 'review' ? playbackUrl : undefined}
              playsInline
              muted
              className="w-full h-full object-contain relative"
              style={{ display: phase === 'review' ? 'block' : 'none', background: '#000' }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />

            {/* Idle placeholder */}
            {phase === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                {zcamEnabled ? (
                  <>
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                      style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}
                    >
                      🎥
                    </div>
                    <div className="font-condensed text-sm text-white/40 text-center px-4 tracking-wide">
                      ZCam E2M4 ready
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl opacity-40"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.15)' }}
                    >
                      🎥
                    </div>
                    <div>
                      <div className="font-condensed text-sm text-yellow-400/80 text-center px-4">
                        ZCam not configured
                      </div>
                      <div className="font-condensed text-xs text-white/25 text-center px-6 mt-1">
                        Set the ZCam IP in{' '}
                        <a href="/manage" className="underline text-white/40 hover:text-white/60">
                          Settings
                        </a>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Recording in-progress overlay */}
            {phase === 'recording' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-red-500 rec-dot" />
                  <span className="font-display text-2xl text-white tracking-widest">
                    RECORDING
                  </span>
                </div>
                <div className="font-condensed text-xs text-white/40 tracking-widest uppercase">
                  Capturing via ZCam — please wait…
                </div>
              </div>
            )}
          </div>

          {/* Recording error */}
          {recordError && (
            <div className="py-3 px-4 rounded-xl font-condensed text-sm text-red-400 bg-red-950 border border-red-900">
              ✕ {recordError}
            </div>
          )}

          {/* Primary action row */}
          <div className="flex gap-2">
            {phase === 'idle' && (
              <button
                onClick={startRecording}
                disabled={!zcamEnabled}
                className="flex-1 py-3 rounded-xl font-display text-2xl tracking-widest transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#f87171',
                }}
              >
                ⬤  START RECORDING
              </button>
            )}

            {phase === 'recording' && (
              <div
                className="flex-1 py-3 rounded-xl font-display text-2xl tracking-widest text-center select-none"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#f87171',
                }}
              >
                <span className="inline-flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-red-500 rec-dot inline-block" />
                  RECORDING…
                </span>
              </div>
            )}

            {phase === 'review' && (
              <button
                onClick={recordAgain}
                className="py-3 px-5 rounded-xl font-condensed text-sm uppercase tracking-widest transition-all active:scale-95"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.45)',
                }}
              >
                ↺ Record Again
              </button>
            )}
          </div>

          {/* Playback controls — shown only in review mode */}
          {phase === 'review' && (
            <>
              <div className="flex gap-2">
                <button
                  onClick={stepBack}
                  className="flex-1 py-4 rounded-xl font-condensed text-sm uppercase tracking-widest transition-all active:scale-95"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.6)',
                  }}
                  title="Step backward one frame (~1/30 s)"
                >
                  ◀ Frame
                </button>

                <button
                  onClick={togglePlay}
                  className="flex-1 py-4 rounded-xl font-display text-2xl tracking-widest transition-all active:scale-95"
                  style={{
                    background: isPlaying ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.4)',
                    color: '#a5b4fc',
                  }}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
                </button>

                <button
                  onClick={stepForward}
                  className="flex-1 py-4 rounded-xl font-condensed text-sm uppercase tracking-widest transition-all active:scale-95"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.6)',
                  }}
                  title="Step forward one frame (~1/30 s)"
                >
                  Frame ▶
                </button>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={restartPlayback}
                  className="py-3 px-6 rounded-xl font-condensed text-xs uppercase tracking-widest transition-all active:scale-95"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.35)',
                  }}
                >
                  ↺ Restart Playback
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Finish Order + Send Results ───────────────────────────── */}
        <div className="flex flex-col gap-4 mt-5 lg:mt-0 lg:sticky lg:top-[86px]">
          {/* Section label */}
          <div>
            <div className="font-condensed text-xs uppercase tracking-widest text-white/30 mb-1">
              Finish Order
            </div>
            <div className="font-condensed text-xs text-white/20 mb-3">
              Use ▲▼ to arrange lanes in finish order (1st at top)
            </div>
            <div className="flex flex-col gap-2">
              {orderedLanes.map((lane, idx) => (
                <LaneOrderCard
                  key={lane}
                  lane={lane}
                  place={idx}
                  laneColors={laneColors}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < orderedLanes.length - 1}
                  onMoveUp={() => moveUp(idx)}
                  onMoveDown={() => moveDown(idx)}
                />
              ))}
            </div>
          </div>

          {/* Send Results */}
          <div className="pb-2">
            {sendResult === 'ok' && (
              <div className="mb-3 py-3 px-4 rounded-xl font-condensed text-sm text-green-400 bg-green-950 border border-green-900">
                ✓ Results sent to guest display
              </div>
            )}
            {sendResult === 'error' && (
              <div className="mb-3 py-3 px-4 rounded-xl font-condensed text-sm text-red-400 bg-red-950 border border-red-900">
                ✕ Failed to send results — please try again
              </div>
            )}
            <button
              onClick={sendResults}
              disabled={sending || orderedLanes.length === 0}
              className="w-full py-3 rounded-xl font-display text-2xl tracking-widest transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.4)',
                color: '#4ade80',
              }}
            >
              {sending ? 'SENDING…' : '📺  SEND TO DISPLAY'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Previous Finishes (full-width below grid) ─────────────────────────── */}
      {history.length > 0 && (
        <div className="max-w-5xl mx-auto w-full px-4 pb-8">
          <div className="border-t border-white/8 pt-5">
            <div className="font-condensed text-xs uppercase tracking-widest text-white/30 mb-3">
              Previous Finishes
            </div>
            <div className="rounded-xl border border-white/5 overflow-hidden">
              {history.map((entry, i) => (
                <HistoryRow
                  key={i}
                  entry={entry}
                  laneColors={laneColors}
                  isLast={i === history.length - 1}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
