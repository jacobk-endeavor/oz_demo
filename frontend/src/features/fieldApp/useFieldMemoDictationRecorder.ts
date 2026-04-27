import { useCallback, useEffect, useRef } from 'react'

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t
    } catch {
      /* ignore */
    }
  }
  return undefined
}

/**
 * While `active`, records `stream` via MediaRecorder. Call `finalize()` to stop and receive one Blob.
 */
export function useFieldMemoDictationRecorder(stream: MediaStream | null, active: boolean) {
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const mimeRef = useRef<string>('audio/webm')

  useEffect(() => {
    if (!active || !stream || import.meta.env.VITEST) return
    chunksRef.current = []
    const mime = pickRecorderMime() ?? 'audio/webm'
    mimeRef.current = mime
    const rec = new MediaRecorder(
      stream,
      MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : undefined,
    )
    recRef.current = rec
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data)
    }
    rec.start(250)
    return () => {
      if (recRef.current === rec && rec.state === 'recording') {
        rec.stop()
      }
      if (recRef.current === rec) recRef.current = null
    }
  }, [active, stream])

  const finalize = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const rec = recRef.current
      const finish = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current })
        resolve(blob.size ? blob : null)
      }
      if (!rec) {
        finish()
        return
      }
      rec.onstop = finish
      if (rec.state === 'recording') rec.stop()
      else queueMicrotask(finish)
    })
  }, [])

  return { finalize }
}
