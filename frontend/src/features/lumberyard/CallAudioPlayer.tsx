import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PauseIcon, PlayIcon } from '../../shared/ui/icons'
import { joinClasses } from '../../shared/ui'

const TIME_THROTTLE_MS = 200

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds % 60)
  const m = Math.floor(seconds / 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function readDuration(a: HTMLAudioElement): number {
  const d = a.duration
  if (!Number.isFinite(d) || d <= 0 || d === Number.POSITIVE_INFINITY) return 0
  return d
}

type Props = {
  audioUrl: string | null
  /**
   * True file duration from ffprobe in call-library (required for buffer-concat MP3s
   * where the browser’s reported `duration` is often wrong, e.g. 4s for a 60s file).
   */
  knownDurationSec?: number | null
}

/**
 * 0–1 slider; total length prefers `knownDurationSec` from the library over `audio.duration`.
 */
function CallAudioPlayerImpl({ audioUrl, knownDurationSec }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const durationRef = useRef(0)
  const seekingRef = useRef(false)
  const seekBarPointerActive = useRef(false)
  const lastTimeUiRef = useRef(0)

  const [playing, setPlaying] = useState(false)
  const [uiTime, setUiTime] = useState(0)
  /** Set only from the audio element; ignored when `knownDurationSec` is set. */
  const [elementDuration, setElementDuration] = useState(0)
  const [seeking, setSeeking] = useState(false)
  const [seekNorm, setSeekNorm] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const src = audioUrl ?? ''

  const totalSec = useMemo(() => {
    if (knownDurationSec != null && knownDurationSec > 0 && Number.isFinite(knownDurationSec)) {
      return knownDurationSec
    }
    return elementDuration
  }, [knownDurationSec, elementDuration])

  const durationReady = totalSec > 0

  useLayoutEffect(() => {
    durationRef.current = totalSec
  }, [totalSec])

  const syncDurationFromElement = useCallback(
    (a: HTMLAudioElement) => {
      if (knownDurationSec != null && knownDurationSec > 0 && Number.isFinite(knownDurationSec)) {
        return
      }
      const d = readDuration(a)
      if (d <= 0) return
      setElementDuration((prev) => (prev === d ? prev : d))
    },
    [knownDurationSec],
  )

  useEffect(() => {
    if (!src) return
    setUiTime(0)
    setSeeking(false)
    seekingRef.current = false
    seekBarPointerActive.current = false
    setPlaybackRate(1)
    if (knownDurationSec == null || knownDurationSec <= 0 || !Number.isFinite(knownDurationSec)) {
      setElementDuration(0)
    }
  }, [src, knownDurationSec])

  useEffect(() => {
    const a = audioRef.current
    if (a) a.playbackRate = playbackRate
  }, [playbackRate, src])

  useEffect(() => {
    if (!src) return
    const a = audioRef.current
    if (!a) return
    const onT = () => {
      if (seekingRef.current) return
      syncDurationFromElement(a)
      const now = performance.now()
      if (now - lastTimeUiRef.current < TIME_THROTTLE_MS) return
      lastTimeUiRef.current = now
      setUiTime(a.currentTime)
    }
    const onDuration = () => syncDurationFromElement(a)
    const onPlay = () => setPlaying(true)
    const onPause = () => {
      setPlaying(false)
      if (!seekingRef.current) setUiTime(a.currentTime)
    }
    const onSeeked = () => {
      if (seekingRef.current) return
      setUiTime(a.currentTime)
    }
    const onEnded = () => {
      setPlaying(false)
      setUiTime(0)
      a.currentTime = 0
    }
    a.addEventListener('timeupdate', onT)
    a.addEventListener('durationchange', onDuration)
    a.addEventListener('loadedmetadata', onDuration)
    a.addEventListener('canplay', onDuration)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('seeked', onSeeked)
    a.addEventListener('ended', onEnded)
    return () => {
      a.removeEventListener('timeupdate', onT)
      a.removeEventListener('durationchange', onDuration)
      a.removeEventListener('loadedmetadata', onDuration)
      a.removeEventListener('canplay', onDuration)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('seeked', onSeeked)
      a.removeEventListener('ended', onEnded)
    }
  }, [src, syncDurationFromElement])

  const syncSeeking = useCallback((v: boolean) => {
    seekingRef.current = v
    setSeeking(v)
  }, [])

  const applySeek = useCallback((p: number) => {
    const t = Math.min(1, Math.max(0, p))
    setSeekNorm(t)
    const a = audioRef.current
    const len = durationRef.current
    if (a && len > 0) {
      a.currentTime = t * len
    }
  }, [])

  const endBarSeek = useCallback(() => {
    if (!seekBarPointerActive.current) return
    seekBarPointerActive.current = false
    syncSeeking(false)
    lastTimeUiRef.current = performance.now()
    const syncT = () => {
      const a = audioRef.current
      if (a) setUiTime(a.currentTime)
    }
    syncT()
    requestAnimationFrame(syncT)
  }, [syncSeeking])

  const getNormFromClientX = useCallback((clientX: number) => {
    const el = barRef.current
    const len = durationRef.current
    if (!el || len <= 0) return 0
    const r = el.getBoundingClientRect()
    const w = r.width
    if (w <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - r.left) / w))
  }, [])

  const toggle = useCallback(() => {
    if (!src) return
    const a = audioRef.current
    if (!a) return
    if (!a.paused) {
      a.pause()
    } else {
      void a.play().catch(() => {
        setPlaying(false)
      })
    }
  }, [src])

  const d = totalSec
  const capDisplay =
    knownDurationSec != null && knownDurationSec > 0 && Number.isFinite(knownDurationSec)
  const displayTime = capDisplay && d > 0 ? Math.min(uiTime, d) : uiTime
  const shownTime = seeking && d > 0 ? seekNorm * d : displayTime
  const sliderValue =
    seeking
      ? seekNorm
      : d > 0 && Number.isFinite(d)
        ? Math.min(1, Math.max(0, displayTime / d))
        : 0
  const ariaPercent =
    d > 0 && Number.isFinite(d) ? Math.round(Math.min(100, Math.max(0, (shownTime / d) * 100))) : 0

  if (!src) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200/90 bg-zinc-50/50 px-3 py-2.5 text-xs text-zinc-500">
        No audio file for this call in the library.
      </p>
    )
  }

  return (
    <div
      className="rounded-xl border border-zinc-200/90 bg-zinc-50/40 p-3 sm:p-3.5 shadow-sm ring-1 ring-zinc-100/80"
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Recording</p>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          className={joinClasses(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10',
            'bg-zinc-800 text-white shadow-sm',
            'transition hover:bg-zinc-700 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2',
            'active:scale-[0.98]',
          )}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-3.5 w-3.5 -translate-x-px sm:h-4 sm:w-4" />
          )}
        </button>
        <div
          className="min-w-0 flex-1 text-right text-xs tabular-nums sm:text-sm"
          aria-live="off"
        >
          <span className="font-medium text-zinc-800">{formatTime(shownTime)}</span>
          <span className="text-zinc-400"> / </span>
          <span className="text-zinc-500">
            {durationReady && d > 0 ? formatTime(d) : '—'}
          </span>
        </div>
      </div>
      <div
        className="mt-2.5 flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Playback speed"
      >
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Speed</span>
        {PLAYBACK_RATES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setPlaybackRate(r)}
            className={joinClasses(
              'min-w-[2.5rem] rounded-md px-2 py-0.5 text-center text-xs font-medium tabular-nums',
              'transition',
              playbackRate === r
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-zinc-100/90 text-zinc-700 ring-1 ring-zinc-200/80 hover:bg-zinc-200/70',
            )}
          >
            {r}×
          </button>
        ))}
      </div>
      <div className="mt-2.5 w-full sm:mt-3">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Seek</p>
        <div
          ref={barRef}
          className={joinClasses(
            'relative w-full min-h-10 min-w-0 select-none rounded-md',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-1',
            durationReady && d > 0
              ? 'cursor-pointer'
              : 'pointer-events-none cursor-not-allowed opacity-40',
          )}
          style={{ touchAction: 'none' }}
          role="slider"
          tabIndex={durationReady && d > 0 ? 0 : -1}
          aria-label="Position in recording"
          aria-disabled={!durationReady || d <= 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ariaPercent}
          aria-valuetext={`${formatTime(shownTime)} of ${formatTime(d)}`}
          onKeyDown={(e) => {
            if (!durationReady || d <= 0) return
            const a = audioRef.current
            const tNow =
              seeking && d > 0 ? seekNorm * d : (a && Number.isFinite(a.currentTime) ? a.currentTime : displayTime)
            const stepS = 10
            if (e.key === 'Home') {
              e.preventDefault()
              applySeek(0)
            } else if (e.key === 'End') {
              e.preventDefault()
              applySeek(1)
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault()
              applySeek((tNow - stepS) / d)
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault()
              applySeek((tNow + stepS) / d)
            } else if (e.key === 'PageDown') {
              e.preventDefault()
              applySeek((tNow - 30) / d)
            } else if (e.key === 'PageUp') {
              e.preventDefault()
              applySeek((tNow + 30) / d)
            }
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            if (!durationReady || d <= 0) return
            e.preventDefault()
            lastTimeUiRef.current = 0
            seekBarPointerActive.current = true
            syncSeeking(true)
            e.currentTarget.setPointerCapture(e.pointerId)
            const p = getNormFromClientX(e.clientX)
            setSeekNorm(p)
            applySeek(p)
          }}
          onPointerMove={(e) => {
            if (!seekBarPointerActive.current) return
            e.preventDefault()
            const p = getNormFromClientX(e.clientX)
            setSeekNorm(p)
            applySeek(p)
          }}
          onPointerUp={endBarSeek}
          onPointerCancel={endBarSeek}
          onLostPointerCapture={endBarSeek}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-zinc-200/90"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-0 top-1/2 h-1.5 max-w-full -translate-y-1/2 rounded-l-full bg-indigo-500/90"
            style={{ width: `${Math.min(100, Math.max(0, sliderValue * 100))}%` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute top-1/2 z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-300/80 bg-white shadow-sm"
            style={{ left: `${Math.min(100, Math.max(0, sliderValue * 100))}%` }}
            aria-hidden
          />
        </div>
      </div>
    </div>
  )
}

function propsEqual(p: Props, n: Props): boolean {
  return p.audioUrl === n.audioUrl && p.knownDurationSec === n.knownDurationSec
}

export const CallAudioPlayer = memo(CallAudioPlayerImpl, propsEqual)
