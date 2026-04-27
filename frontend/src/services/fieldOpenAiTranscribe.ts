/**
 * Field memo dictation: OpenAI **audio transcriptions** (Whisper-class).
 *
 * - **Development / preview:** `POST /api/oz/transcribe` (Vite proxy; key stays on server).
 * - **Production:** direct `POST https://api.openai.com/v1/audio/transcriptions` with `VITE_OPENAI_API_KEY`.
 */

const OPENAI_TRANSCRIPTIONS = 'https://api.openai.com/v1/audio/transcriptions'

function defaultModel(): string {
  return import.meta.env.VITE_OPENAI_TRANSCRIPTION_MODEL?.trim() || 'whisper-1'
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function parseTranscriptionJson(raw: string): string {
  const data = JSON.parse(raw) as { text?: string; error?: { message?: string } }
  const errMsg = data.error?.message
  if (errMsg) throw new Error(errMsg)
  const text = data.text?.trim()
  if (!text) throw new Error('OpenAI returned empty transcription')
  return text
}

/**
 * Transcribe a short voice memo recording. `blob` is typically `audio/webm` from `MediaRecorder`.
 */
export async function transcribeFieldMemoAudio(blob: Blob): Promise<string> {
  if (import.meta.env.VITEST) {
    throw new Error('Transcription is not available in Vitest')
  }
  const model = defaultModel()
  if (import.meta.env.DEV) {
    const audioBase64 = await blobToBase64(blob)
    const res = await fetch('/api/oz/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType: blob.type || 'audio/webm',
        model,
      }),
    })
    const raw = await res.text()
    if (!res.ok) {
      let msg = raw
      try {
        const parsed = JSON.parse(raw) as { error?: string | { message?: string } }
        if (typeof parsed.error === 'string') msg = parsed.error
        else if (parsed.error && typeof parsed.error === 'object')
          msg = parsed.error.message ?? raw
      } catch {
        /* use raw */
      }
      throw new Error(msg || `Transcription failed (${res.status})`)
    }
    return parseTranscriptionJson(raw)
  }

  const key = import.meta.env.VITE_OPENAI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'Set VITE_OPENAI_API_KEY for transcription in production builds, or run the app via `npm run dev` so /api/oz/transcribe can use OPENAI_API_KEY.',
    )
  }
  const form = new FormData()
  form.append('file', blob, 'memo.webm')
  form.append('model', model)
  const res = await fetch(OPENAI_TRANSCRIPTIONS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  })
  const raw = await res.text()
  if (!res.ok) {
    let msg = raw
    try {
      msg = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw
    } catch {
      /* use raw */
    }
    throw new Error(msg || `Transcription failed (${res.status})`)
  }
  return parseTranscriptionJson(raw)
}
