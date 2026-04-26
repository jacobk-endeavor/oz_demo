import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'oz-field-audioinput-id'
const ONBOARDING_KEY = 'oz-field-mic-onboarding-done'

function readSavedDeviceId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

function writeSavedDeviceId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function readMicOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1'
  } catch {
    return false
  }
}

function writeMicOnboardingDone() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1')
  } catch {
    /* ignore */
  }
}

function stopAndClearStream(stream: MediaStream | null) {
  if (!stream) return
  for (const t of stream.getTracks()) {
    try {
      t.stop()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Enters a real microphone: permission via `getUserMedia`, then labeled device list
 * and reconnect with `deviceId: { exact }`. All in-page — no new tabs.
 */
export function useFieldMicrophone() {
  const [devices, setDevices] = useState<readonly MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(readSavedDeviceId() ?? '')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'denied' | 'unavailable'>('idle')
  const [micOnboardingDone, setMicOnboardingDone] = useState(readMicOnboardingDone)
  const streamRef = useRef<MediaStream | null>(null)

  const refreshDeviceList = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([])
      return
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter((d) => d.kind === 'audioinput'))
    } catch {
      setDevices([])
    }
  }, [])

  const connect = useCallback(
    async (deviceId: string | null) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable')
        setError('This browser does not expose microphones to the page.')
        return null
      }
      setError(null)
      setStatus('connecting')
      stopAndClearStream(streamRef.current)
      streamRef.current = null
      setStream(null)

      const audioConstraints: boolean | MediaTrackConstraints =
        deviceId && deviceId.length > 0
          ? { deviceId: { exact: deviceId } }
          : true

      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false })
        const track = s.getAudioTracks()[0]
        const appliedId = track?.getSettings().deviceId ?? deviceId ?? ''
        if (appliedId) {
          setSelectedDeviceId(appliedId)
          writeSavedDeviceId(appliedId)
        }
        streamRef.current = s
        setStream(s)
        setStatus('live')
        writeMicOnboardingDone()
        setMicOnboardingDone(true)
        void refreshDeviceList()
        return s
      } catch (e) {
        setStatus('denied')
        const msg =
          e instanceof DOMException
            ? e.name === 'NotAllowedError' || e.name === 'SecurityError'
              ? 'Microphone access was blocked. Use the in-page allow prompt, or review site permissions in the address bar (no need to open a separate settings tab).'
              : e.message
            : String(e)
        setError(msg)
        return null
      }
    },
    [refreshDeviceList],
  )

  const ensureStream = useCallback(
    async (preferDeviceId?: string | null) => {
      const want = preferDeviceId ?? (selectedDeviceId || readSavedDeviceId())
      if (streamRef.current && want && streamRef.current.getAudioTracks()[0]?.getSettings().deviceId === want) {
        return streamRef.current
      }
      if (streamRef.current && !want) {
        return streamRef.current
      }
      return connect(want)
    },
    [connect, selectedDeviceId],
  )

  const setPreferredDeviceId = useCallback((id: string) => {
    setSelectedDeviceId(id)
    writeSavedDeviceId(id)
  }, [])

  const chooseDevice = useCallback(
    async (nextId: string) => {
      setSelectedDeviceId(nextId)
      writeSavedDeviceId(nextId)
      await connect(nextId)
    },
    [connect],
  )

  const disconnect = useCallback(() => {
    stopAndClearStream(streamRef.current)
    streamRef.current = null
    setStream(null)
    setStatus('idle')
  }, [])

  useEffect(() => {
    if (import.meta.env.VITEST) return
    if (!navigator.mediaDevices?.addEventListener) return
    const onChange = () => {
      void refreshDeviceList()
    }
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [refreshDeviceList])

  useEffect(() => {
    if (import.meta.env.VITEST) return
    void refreshDeviceList()
  }, [refreshDeviceList])

  return {
    devices,
    selectedDeviceId,
    stream,
    error,
    status,
    micOnboardingDone,
    refreshDeviceList,
    connect,
    ensureStream,
    chooseDevice,
    setPreferredDeviceId,
    disconnect,
  }
}
