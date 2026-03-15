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

const PLACE_LABELS = ['1ST', '2ND', '3RD', '4TH']

function PlaceCard({ entry, place, laneColors, isNew }) {
  const colorName = laneColors[entry.lane] || 'White'
  const palette = LANE_PALETTES[colorName] || LANE_PALETTES.White
  const isWinner = place === 0

  return (
    <div
      className={`lane-card relative rounded-2xl border-2 overflow-hidden ${isNew ? (isWinner ? 'winner-pop' : 'slide-in') : ''}`}
      style={{
        animationDelay: `${place * 0.08}s`,
        background: palette.bg,
        borderColor: palette.border,
        boxShadow: isWinner
          ? `0 0 40px ${palette.glow}, 0 0 80px ${palette.glow}40`
          : `0 0 12px ${palette.glow}50`,
      }}
    >
      {isWinner && (
        <div className="checkered-bar absolute top-0 left-0 right-0 h-1.5 opacity-60" />
      )}

      <div className="track-stripe absolute inset-0 opacity-100 pointer-events-none" />

      <div className="relative flex items-center gap-4 px-5 py-4">
        {/* Place badge */}
        <div className="flex-shrink-0 text-center w-16">
          <div
            className="font-display text-5xl leading-none"
            style={{ color: palette.text }}
          >
            {PLACE_LABELS[place]}
          </div>
          {isWinner && <div className="text-xl mt-0.5">🏆</div>}
        </div>

        {/* Divider */}
        <div
          className="w-px self-stretch opacity-30"
          style={{ background: palette.border }}
        />

        {/* Lane info */}
        <div className="flex-1">
          <div
            className="font-condensed text-xs font-semibold tracking-widest uppercase opacity-50 mb-0.5"
            style={{ color: palette.text }}
          >
            Lane {entry.lane}
          </div>
          <div
            className="font-display text-4xl leading-none font-semibold"
            style={{ color: palette.text }}
          >
            {colorName}
          </div>
        </div>

        {/* Gap time */}
        {place > 0 && (
          <div className="text-right flex-shrink-0">
            <div
              className="font-condensed text-xs tracking-widest uppercase opacity-40 mb-0.5"
              style={{ color: palette.text }}
            >
              behind
            </div>
            <div
              className="font-display text-2xl"
              style={{ color: palette.text }}
            >
              +{entry.gapMs.toFixed(0)}
              <span className="text-sm opacity-60"> ms</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RacingCard({ lane, laneColors }) {
  const colorName = laneColors[lane] || 'White'
  const palette = LANE_PALETTES[colorName] || LANE_PALETTES.White

  return (
    <div
      className="lane-card relative rounded-2xl border-2 overflow-hidden slide-in"
      style={{
        background: palette.bg,
        borderColor: palette.border + '40',
        boxShadow: `0 0 12px ${palette.glow}20`,
        opacity: 0.45,
      }}
    >
      <div className="track-stripe absolute inset-0 opacity-100 pointer-events-none" />

      <div className="relative flex items-center gap-4 px-5 py-4">
        {/* Place badge */}
        <div className="flex-shrink-0 text-center w-16">
          <div
            className="font-display text-5xl leading-none"
            style={{ color: palette.text, opacity: 0.2 }}
          >
            —
          </div>
        </div>

        {/* Divider */}
        <div
          className="w-px self-stretch opacity-20"
          style={{ background: palette.border }}
        />

        {/* Lane info */}
        <div className="flex-1">
          <div
            className="font-condensed text-xs font-semibold tracking-widest uppercase opacity-50 mb-0.5"
            style={{ color: palette.text }}
          >
            Lane {lane}
          </div>
          <div
            className="font-display text-4xl leading-none font-semibold"
            style={{ color: palette.text }}
          >
            {colorName}
          </div>
        </div>

        {/* Racing indicator */}
        <div className="font-condensed text-sm tracking-widest uppercase text-green-500 animate-pulse">
          racing
        </div>
      </div>
    </div>
  )
}

function WaitingState({ status }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      {status === 'armed' ? (
        <>
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-2 border-green-500 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-green-400" />
            </div>
            <div className="armed-pulse absolute inset-0 rounded-full border-2 border-green-400 opacity-60" />
          </div>
          <div className="font-display text-4xl tracking-widest text-green-400">
            READY
          </div>
          <div className="font-condensed text-sm tracking-widest uppercase text-green-600">
            Sensors Armed — Waiting for Cars
          </div>
        </>
      ) : (
        <>
          <div className="font-display text-6xl text-white/10">🏁</div>
          <div className="font-display text-3xl tracking-widest text-white/30">
            STANDBY
          </div>
          <div className="font-condensed text-xs tracking-widest uppercase text-white/20">
            Waiting for next heat
          </div>
        </>
      )}
    </div>
  )
}

function HistoryRow({ item, laneColors }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/5">
      <span className="font-condensed text-xs text-white/30 w-14">
        Heat {item.heat}
      </span>
      <div className="flex gap-1.5 flex-1">
        {item.finishOrder.map((e) => (
          <span
            key={e.lane}
            className="font-condensed text-xs px-2 py-0.5 rounded"
            style={{
              background: (
                LANE_PALETTES[laneColors[e.lane]] || LANE_PALETTES.White
              ).bg,
              color: (
                LANE_PALETTES[laneColors[e.lane]] || LANE_PALETTES.White
              ).text,
              border: `1px solid ${(LANE_PALETTES[laneColors[e.lane]] || LANE_PALETTES.White).border}60`,
            }}
          >
            {laneColors[e.lane] || `L${e.lane}`}
          </span>
        ))}
      </div>
    </div>
  )
}

function HeatVideo({ videoUrl, onEnded }) {
  const videoRef = useRef(null)

  function realToPlayback(realSeconds, captureFps, playbackFps) {
    return realSeconds * (captureFps / playbackFps)
  }

  useEffect(() => {
    if (videoUrl && videoRef.current) {
      const video = videoRef.current
      const onLoaded = () => {
        // skip the first 4 seconds of playback because preroll is 5 seconds
        // but we really don't need more than 4 seconds
        video.currentTime = realToPlayback(4, 240, 29.97)
        video.play().catch((err) => {
          console.warn('ZCam replay autoplay blocked:', err.message)
        })
      }
      video.addEventListener('loadedmetadata', onLoaded, { once: true })
      video.load()
      return () => video.removeEventListener('loadedmetadata', onLoaded)
    }
  }, [videoUrl])

  if (!videoUrl) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center cursor-pointer"
      onClick={onEnded}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        playsInline
        muted
        autoPlay
        onEnded={onEnded}
        className="w-full h-full object-contain"
        style={{ background: '#000' }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function HeatStagingPanel({ currentHeat }) {
  if (!currentHeat) return null
  const { lanes = [] } = currentHeat
  const racerLanes = lanes.filter((l) => l.racerId)
  if (racerLanes.length === 0) return null
  return (
    <div className="border-b border-white/5 bg-black/30 px-4 py-3">
      <div className="max-w-2xl mx-auto">
        <div className="font-condensed text-xs uppercase tracking-widest text-white/25 mb-2">
          Next Up — Heat #{currentHeat.number}
        </div>
        <div className="flex gap-2 flex-wrap">
          {racerLanes.map((l) => (
            <div
              key={l.lane}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/3"
            >
              <span className="font-condensed text-xs text-white/30">L{l.lane}</span>
              <span className="font-condensed text-sm font-semibold">
                {l.racerName || l.racerId}
              </span>
              {l.carNumber && (
                <span className="font-condensed text-xs text-white/40">#{l.carNumber}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LeaderboardPanel({ leaderboard }) {
  if (!leaderboard || leaderboard.length === 0) return null
  return (
    <div className="border-t border-white/5 bg-black/20 px-4 py-4">
      <div className="max-w-2xl mx-auto">
        <div className="font-condensed text-xs uppercase tracking-widest text-white/25 mb-3">
          Standings
        </div>
        <div className="flex flex-col gap-1.5">
          {leaderboard.slice(0, 8).map((entry) => (
            <div key={entry.racerId} className="flex items-center gap-3">
              <span className="font-display text-xl w-10 text-right leading-none text-white/40">
                {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
              </span>
              <span className="font-condensed text-xs text-white/30 w-6">{entry.carNumber}</span>
              <span className="flex-1 font-condensed text-sm font-semibold truncate">{entry.name}</span>
              {entry.bestTime != null && (
                <span className="font-condensed text-xs text-green-400">{entry.bestTime.toFixed(3)}s</span>
              )}
              <span className="font-display text-lg text-orange-400 w-8 text-right leading-none">{entry.points}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [state, setState] = useState(null)
  const [eventData, setEventData] = useState(null)
  const [isNew, setIsNew] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [activeVideoUrl, setActiveVideoUrl] = useState(null)
  const [displayCleared, setDisplayCleared] = useState(false)
  const wsRef = useRef(null)
  const finishedAtRef = useRef(null)
  const videoTimerRef = useRef(null)

  // Hide overlay whenever the server clears videoUrl (reset)
  useEffect(() => {
    if (state && state.videoUrl === null) {
      setShowVideo(false)
      setActiveVideoUrl(null)
      clearTimeout(videoTimerRef.current)
      videoTimerRef.current = null
      finishedAtRef.current = null
    }
  }, [state?.videoUrl])

  // Allow Escape key to dismiss the video overlay
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setShowVideo(false)
        setActiveVideoUrl(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    function connect() {
      const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${wsProtocol}//${location.host}`)
      wsRef.current = ws
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        setState(msg.state)
        if (msg.event) setEventData(msg.event)
        if (msg.type === 'finished') {
          setIsNew(true)
          setDisplayCleared(false)
          setTimeout(() => setIsNew(false), 2000)
          finishedAtRef.current = Date.now()
        }
        if (msg.type === 'armed' || msg.type === 'reset') {
          setDisplayCleared(false)
        }
        if (msg.type === 'clear') {
          setDisplayCleared(true)
        }
        if (msg.type === 'video') {
          const url = msg.state?.videoUrl
          if (url) {
            const elapsed = finishedAtRef.current
              ? Date.now() - finishedAtRef.current
              : 0
            const delay = Math.max(0, 5000 - elapsed)
            clearTimeout(videoTimerRef.current)
            videoTimerRef.current = setTimeout(() => {
              videoTimerRef.current = null
              setActiveVideoUrl(url)
              setShowVideo(true)
            }, delay)
          }
        }
      }
      ws.onclose = () => setTimeout(connect, 2000)
    }
    connect()
    return () => {
      wsRef.current?.close()
      clearTimeout(videoTimerRef.current)
    }
  }, [])

  if (!state)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="font-display text-2xl text-white/20 tracking-widest">
          CONNECTING…
        </div>
      </div>
    )

  const { finishOrder, laneColors, status, heat, history, numLanes } = state
  const showResults =
    (status === 'finished' ||
      (status === 'armed' && finishOrder.length > 0)) &&
    !displayCleared

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Header */}
      <header className="relative border-b border-white/10 bg-black/40 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div>
          <div className="font-display text-4xl tracking-widest leading-none text-white">
            {eventData?.eventName || 'PINEWOOD DERBY'}
          </div>
          <div className="font-condensed text-xs tracking-widest uppercase text-white/30 mt-0.5">
            Live Results Display
          </div>
        </div>
        <div className="text-right">
          <div className="font-condensed text-xs uppercase tracking-widest text-white/30">
            Heat
          </div>
          <div className="font-display text-5xl text-white leading-none">
            {heat}
          </div>
        </div>
      </header>

      {/* Heat staging — shown when a heat is pending/active in the bracket */}
      {eventData?.currentHeat && (
        <HeatStagingPanel currentHeat={eventData.currentHeat} />
      )}

      {/* Main results */}
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {showResults ? (
          <div className="flex flex-col gap-3">
            {finishOrder.map((entry, i) => (
              <PlaceCard
                key={`f-${entry.lane}`}
                entry={entry}
                place={i}
                laneColors={laneColors}
                isNew={isNew}
              />
            ))}
          </div>
        ) : (
          <WaitingState status={status} />
        )}
      </main>

      {/* Heat video replay — fullscreen overlay, auto-hides after one play */}
      {showVideo && (
        <HeatVideo
          videoUrl={activeVideoUrl}
          onEnded={() => setShowVideo(false)}
        />
      )}

      {/* Leaderboard */}
      {eventData?.leaderboard?.length > 0 && (
        <LeaderboardPanel leaderboard={eventData.leaderboard} />
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="border-t border-white/5 px-6 py-4 max-w-2xl mx-auto w-full">
          <div className="font-condensed text-xs uppercase tracking-widest text-white/20 mb-3">
            Recent Heats
          </div>
          {history.slice(0, 5).map((item) => (
            <HistoryRow
              key={item.heat}
              item={item}
              laneColors={laneColors}
            />
          ))}
        </div>
      )}
    </div>
  )
}
