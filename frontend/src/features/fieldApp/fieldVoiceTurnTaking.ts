import { useEffect, useRef, useState } from 'react'

export type FieldVoiceTurnTakingOptions = {
  /** Linear RMS above this counts as user speech (lower = softer voice triggers “speaking”). */
  speechThreshold?: number
  /** Linear RMS below this for `silenceMs` after speech triggers `onSpeechEnd`. */
  silenceThreshold?: number
  /** Audio must stay above `speechThreshold` for this long to count as actual speech (debounces taps / pops). */
  minSpeechMs?: number
  /** After speech, audio must stay below `silenceThreshold` for this long before firing `onSpeechEnd`. */
  silenceMs?: number
}

const DEFAULTS: Required<FieldVoiceTurnTakingOptions> = {
  speechThreshold: 0.015,
  silenceThreshold: 0.01,
  minSpeechMs: 180,
  silenceMs: 1000,
}

type Callbacks = {
  onSpeechStart?: () => void
  onSpeechEnd?: () => void
}

/**
 * Voice-activity detector built on a single AnalyserNode + RMS thresholding.
 * While `active` is true and `stream` is live, watches for the rep speaking and
 * then stopping; fires `onSpeechEnd` once per cycle when silence has held long
 * enough after speech.
 *
 * The detector resets cleanly when `active` flips false → true (e.g. between
 * Oz playback and the next listening turn).
 */
export function useFieldVoiceTurnTaking(
  stream: MediaStream | null,
  active: boolean,
  callbacks: Callbacks,
  options: FieldVoiceTurnTakingOptions = {},
): { isSpeaking: boolean } {
  const { speechThreshold, silenceThreshold, minSpeechMs, silenceMs } = {
    ...DEFAULTS,
    ...options,
  }
  const [isSpeaking, setIsSpeaking] = useState(false)
  const cbRef = useRef(callbacks)
  useEffect(() => {
    cbRef.current = callbacks
  }, [callbacks])

  useEffect(() => {
    if (!stream || !active) return
    if (import.meta.env.VITEST) return
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

    let speaking = false
    let speechStartedAt: number | null = null
    let silenceStartedAt: number | null = null
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

      if (!speaking) {
        if (rms > speechThreshold) {
          if (speechStartedAt == null) speechStartedAt = now
          if (now - speechStartedAt >= minSpeechMs) {
            speaking = true
            silenceStartedAt = null
            setIsSpeaking(true)
            cbRef.current.onSpeechStart?.()
          }
        } else {
          speechStartedAt = null
        }
      } else {
        if (rms < silenceThreshold) {
          if (silenceStartedAt == null) silenceStartedAt = now
          if (now - silenceStartedAt >= silenceMs) {
            speaking = false
            speechStartedAt = null
            silenceStartedAt = null
            setIsSpeaking(false)
            cbRef.current.onSpeechEnd?.()
          }
        } else {
          silenceStartedAt = null
        }
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
      setIsSpeaking(false)
    }
  }, [stream, active, speechThreshold, silenceThreshold, minSpeechMs, silenceMs])

  return { isSpeaking }
}
