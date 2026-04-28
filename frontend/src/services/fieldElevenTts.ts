import { useEffect } from 'react'

/**
 * Field App: Eleven Labs TTS via the dev/preview server at `POST /api/oz/elevenlabs/tts`
 * (see `vite.config.ts`). No API key in the browser.
 *
 * At most one TTS is active: new `play` or `stop` aborts the in-flight `fetch` and any playing audio.
 */
let lastAudio: HTMLAudioElement | null = null
let lastObjectUrl: string | null = null

/** When `playFieldElevenTts` is waiting on playback, `stopFieldTts` calls this to unblock the await (barge-in / stop). */
let ttsUnblock: (() => void) | null = null

let ttsFetchAbort: AbortController | null = null
let ttsFetchTimeout: ReturnType<typeof setTimeout> | null = null

/** Field ElevenLabs TTS; toggled with **M** app-wide via `useFieldTtsMuteHotkey` in `App`. */
let fieldTtsOutputMuted = false

const ttsSessionListeners = new Set<(key: string | null) => void>()

export function isFieldTtsOutputMuted(): boolean {
  return fieldTtsOutputMuted
}

/**
 * Mutes or unmutes Field TTS output. Applies to the current and future
 * `playFieldElevenTts` playback (volume 0/1; updates the live `HTMLAudioElement` when set).
 */
export function setFieldTtsOutputMuted(muted: boolean): void {
  fieldTtsOutputMuted = muted
  if (lastAudio) lastAudio.volume = muted ? 0 : 1
}

/** @returns the new muted state */
export function toggleFieldTtsOutputMute(): boolean {
  setFieldTtsOutputMuted(!fieldTtsOutputMuted)
  return fieldTtsOutputMuted
}

function notifyTtsSession(key: string | null) {
  for (const fn of ttsSessionListeners) fn(key)
}

/** Other Field TTS UIs (e.g. another button) can reset when a different `sessionKey` starts playing. */
export function subscribeTtsSessionKey(fn: (key: string | null) => void): () => void {
  ttsSessionListeners.add(fn)
  return () => ttsSessionListeners.delete(fn)
}

function abortTtsFetch(): void {
  ttsFetchAbort?.abort()
  ttsFetchAbort = null
  if (ttsFetchTimeout != null) {
    clearTimeout(ttsFetchTimeout)
    ttsFetchTimeout = null
  }
}

function cleanupTtsAudio(): void {
  if (lastAudio) {
    lastAudio.pause()
    lastAudio.src = ''
    lastAudio = null
  }
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl)
    lastObjectUrl = null
  }
}

export function stopFieldTts(): void {
  const u = ttsUnblock
  ttsUnblock = null
  u?.()
  abortTtsFetch()
  cleanupTtsAudio()
}

export type PlayFieldElevenTtsOptions = {
  /**
   * Called when audio is ready and playback is about to start (after full MP3 is downloaded).
   * For instant UI, drive state from the button’s `onClick` instead of waiting for this.
   */
  onPlaybackStart?: () => void
  /**
   * Announced to `subscribeTtsSessionKey` so other TTS affordances (other buttons) can clear
   * if they are not the active source.
   */
  sessionKey?: string
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

function ttsFetchFailureHint(message: string): string {
  if (
    message === 'Failed to fetch' ||
    /NetworkError|load failed|Failed to fetch/i.test(message)
  ) {
    return (
      ' Field voice needs the Vite server that exposes POST /api/oz/elevenlabs/tts on the same host as this page. ' +
      'From the Oz-Demo repo root run `npm run dev` (or `npm run build && npm start`). ' +
      'Set `ELEVENLABS_API_KEY` in `.env` at the repo root and restart. ' +
      'Opening `dist/index.html` directly or static-only hosting will not work.'
    )
  }
  return ''
}

/**
 * @throws on network / HTTP / playback error (aborted fetches resolve without throwing).
 */
export async function playFieldElevenTts(
  text: string,
  optionsOrOnStart?: PlayFieldElevenTtsOptions | (() => void),
): Promise<void> {
  if (import.meta.env.VITEST) {
    throw new Error('ElevenLabs TTS disabled in tests')
  }
  const options: PlayFieldElevenTtsOptions =
    typeof optionsOrOnStart === 'function' ? { onPlaybackStart: optionsOrOnStart } : (optionsOrOnStart ?? {})

  stopFieldTts()
  const { onPlaybackStart, sessionKey } = options
  if (sessionKey != null) {
    notifyTtsSession(sessionKey)
  }

  const fetchAc = new AbortController()
  ttsFetchAbort = fetchAc
  ttsFetchTimeout = setTimeout(() => {
    ttsFetchTimeout = null
    fetchAc.abort()
  }, 90_000)

  let res: Response
  try {
    res = await fetch('/api/oz/elevenlabs/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: fetchAc.signal,
    })
  } catch (e) {
    if (ttsFetchTimeout != null) {
      clearTimeout(ttsFetchTimeout)
      ttsFetchTimeout = null
    }
    ttsFetchAbort = null
    if (isAbortError(e)) {
      return
    }
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(msg + ttsFetchFailureHint(msg))
  }

  if (ttsFetchTimeout != null) {
    clearTimeout(ttsFetchTimeout)
    ttsFetchTimeout = null
  }
  ttsFetchAbort = null

  if (!res.ok) {
    // Read the body once: `res.json()` consumes the stream; a follow-up `res.text()` throws
    // "Failed to execute 'text' on 'Response': body stream already read" in browsers.
    const raw = await res.text()
    let detail = raw
    try {
      const j = JSON.parse(raw) as { error?: string }
      if (typeof j.error === 'string' && j.error.trim().length > 0) detail = j.error
    } catch {
      // keep `raw` (HTML/plain error page from proxy, etc.)
    }
    throw new Error(detail.trim() || `TTS failed (${res.status})`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  lastObjectUrl = url
  const audio = new Audio(url)
  audio.volume = fieldTtsOutputMuted ? 0 : 1
  lastAudio = audio
  onPlaybackStart?.()
  return new Promise((resolve, reject) => {
    ttsUnblock = () => {
      ttsUnblock = null
      resolve()
    }
    audio.onended = () => {
      ttsUnblock = null
      cleanupTtsAudio()
      resolve()
    }
    audio.onerror = () => {
      ttsUnblock = null
      cleanupTtsAudio()
      reject(new Error('Audio playback failed'))
    }
    void audio.play().catch((e) => {
      ttsUnblock = null
      cleanupTtsAudio()
      reject(e instanceof Error ? e : new Error(String(e)))
    })
  })
}

/**
 * **M** / **m**: toggle Field TTS output mute on any page (capture phase; works without focusing the orb).
 * Skipped while focus is in `input`, `textarea`, `select`, `contenteditable`, or `[data-field-ignore-hotkeys]`.
 */
export function useFieldTtsMuteHotkey() {
  useEffect(() => {
    if (import.meta.env.VITEST) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'm' && e.key !== 'M') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const raw = e.target
      if (raw instanceof HTMLElement) {
        if (raw.closest('input, textarea, select, [data-field-ignore-hotkeys]')) return
        if (raw.isContentEditable) return
      }
      e.preventDefault()
      toggleFieldTtsOutputMute()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
