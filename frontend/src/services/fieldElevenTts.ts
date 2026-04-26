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

const ttsSessionListeners = new Set<(key: string | null) => void>()

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
    throw e instanceof Error ? e : new Error(String(e))
  }

  if (ttsFetchTimeout != null) {
    clearTimeout(ttsFetchTimeout)
    ttsFetchTimeout = null
  }
  ttsFetchAbort = null

  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: string }
      detail = j.error ?? ''
    } catch {
      detail = await res.text()
    }
    throw new Error(detail || `TTS failed (${res.status})`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  lastObjectUrl = url
  const audio = new Audio(url)
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
