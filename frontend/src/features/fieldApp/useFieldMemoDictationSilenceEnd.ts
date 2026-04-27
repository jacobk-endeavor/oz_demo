import { useEffect, useRef } from 'react'

export type FieldMemoDictationSilenceOptions = {
  /** RMS above this marks “speech now” (aligned with `useFieldVoiceTurnTaking` defaults). */
  speechThreshold?: number
  /** After the rep has spoken at least once, end when volume stays below threshold this long (ms). */
  silenceTailMs?: number
  onDone: () => void
}

/**
 * One-shot “done dictating” detector: after any speech, fires `onDone` once when the mic stays
 * quiet for `silenceTailMs`. Longer tail than normal turn-taking so multi-sentence memos work.
 */
export function useFieldMemoDictationSilenceEnd(
  stream: MediaStream | null,
  active: boolean,
  opts: FieldMemoDictationSilenceOptions,
): void {
  const {
    speechThreshold = 0.015,
    silenceTailMs = 3600,
    onDone,
  } = opts

  const firedRef = useRef(false)
  const cbRef = useRef(onDone)
  useEffect(() => {
    cbRef.current = onDone
  }, [onDone])

  useEffect(() => {
    firedRef.current = false
  }, [active])

  useEffect(() => {
    if (!stream || !active || import.meta.env.VITEST) return
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return

    const ac = new AudioCtx()
    if (ac.state === 'suspended') void ac.resume()
    const source = ac.createMediaStreamSource(stream)
    const an = ac.createAnalyser()
    an.fftSize = 1024
    source.connect(an)
    const data = new Float32Array(an.fftSize)

    let everSpoke = false
    let lastLoudAt = performance.now()
    let raf = 0

    const tick = () => {
      an.getFloatTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = data[i]!
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      const now = performance.now()

      if (rms > speechThreshold) {
        everSpoke = true
        lastLoudAt = now
      } else if (everSpoke && now - lastLoudAt >= silenceTailMs && !firedRef.current) {
        firedRef.current = true
        cbRef.current()
        return
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      try {
        source.disconnect()
      } catch {
        /* ignore */
      }
      void ac.close()
    }
  }, [stream, active, speechThreshold, silenceTailMs])
}
