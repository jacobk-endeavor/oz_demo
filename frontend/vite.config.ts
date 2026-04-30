/// <reference types="vitest" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ozLumberyardApiPlugin } from './vite.ozLumberyardApi'
import { ozEmailApiPlugin } from './vite.ozEmailApi'
import { ozRagCallsApiPlugin } from './vite.ozRagCallsApi'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Monorepo / demo: keep `.env` in the repo root (same folder as this file’s parent). */
const ENV_DIR = path.resolve(__dirname, '..')
const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions'
const ELEVEN_API = 'https://api.elevenlabs.io/v1'
/** Eleven Labs “Rachel” — used when `ELEVENLABS_VOICE_ID` is unset (see `.env.example`). */
const ELEVEN_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function resolveOpenAiKey(mode: string): string | undefined {
  const fe = loadEnv(mode, __dirname, '')
  const root = loadEnv(mode, ENV_DIR, '')
  return (
    process.env.OPENAI_API_KEY ||
    process.env.VITE_OPENAI_API_KEY ||
    fe.OPENAI_API_KEY ||
    fe.VITE_OPENAI_API_KEY ||
    root.OPENAI_API_KEY ||
    root.VITE_OPENAI_API_KEY
  )?.trim()
}

function resolveElevenLabsKey(mode: string): string | undefined {
  const fe = loadEnv(mode, __dirname, '')
  const root = loadEnv(mode, ENV_DIR, '')
  return (
    process.env.ELEVENLABS_API_KEY ||
    fe.ELEVENLABS_API_KEY ||
    root.ELEVENLABS_API_KEY
  )?.trim()
}

function resolveElevenVoiceId(mode: string): string {
  const fe = loadEnv(mode, __dirname, '')
  const root = loadEnv(mode, ENV_DIR, '')
  return (
    process.env.ELEVENLABS_VOICE_ID ||
    fe.ELEVENLABS_VOICE_ID ||
    root.ELEVENLABS_VOICE_ID ||
    ELEVEN_DEFAULT_VOICE_ID
  ).trim()
}

function resolveElevenModelId(mode: string): string {
  const fe = loadEnv(mode, __dirname, '')
  const root = loadEnv(mode, ENV_DIR, '')
  return (
    process.env.ELEVENLABS_MODEL_ID ||
    fe.ELEVENLABS_MODEL_ID ||
    root.ELEVENLABS_MODEL_ID ||
    'eleven_multilingual_v2'
  ).trim()
}

function ozOpenAiDevProxy(mode: string) {
  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = req.url?.split('?')[0] ?? ''
    if (url !== '/api/oz/openai') {
      next()
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    const openaiKey = resolveOpenAiKey(mode)
    if (!openaiKey) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error:
            'Set OPENAI_API_KEY in ' +
            ENV_DIR +
            '/.env (or frontend/.env) and restart the dev server so the Oz proxy can read it.',
        }),
      )
      return
    }
    try {
      const raw = await readBody(req)
      const r = await fetch(OPENAI_CHAT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: raw,
      })
      const text = await r.text()
      res.statusCode = r.status
      res.setHeader('Content-Type', 'application/json')
      res.end(text)
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: String(e) }))
    }
  }

  return {
    name: 'oz-openai-proxy',
    configureServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
  }
}

function ozElevenLabsTtsProxy(mode: string) {
  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = req.url?.split('?')[0] ?? ''
    if (url !== '/api/oz/elevenlabs/tts') {
      next()
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    const key = resolveElevenLabsKey(mode)
    if (!key) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error:
            'Set ELEVENLABS_API_KEY in ' + ENV_DIR + '/.env and restart the dev server (or Vite preview).',
        }),
      )
      return
    }
    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw) as { text?: string }
      const text = (body.text ?? '').trim()
      if (!text) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Missing text' }))
        return
      }
      const voiceId = resolveElevenVoiceId(mode)
      const model_id = resolveElevenModelId(mode)
      // Bound upstream wait so the process responds before App Platform’s proxy times out
      // (indefinite hang surfaces as 503 HTML from the edge, not a JSON error).
      const r = await fetch(`${ELEVEN_API}/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'audio/mpeg',
          'xi-api-key': key,
        },
        body: JSON.stringify({
          text: text.length > 4_000 ? text.slice(0, 4_000) : text,
          model_id,
        }),
        signal: AbortSignal.timeout(50_000),
      })
      if (!r.ok) {
        const errText = await r.text()
        res.statusCode = r.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: errText || 'ElevenLabs request failed' }))
        return
      }
      const buf = await r.arrayBuffer()
      res.statusCode = 200
      res.setHeader('Content-Type', 'audio/mpeg')
      res.end(Buffer.from(buf))
    } catch (e) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : ''
      if (name === 'TimeoutError' || name === 'AbortError') {
        res.statusCode = 504
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error:
              'ElevenLabs did not respond in time. Check outbound network, API status, and try again.',
          }),
        )
        return
      }
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: String(e) }))
    }
  }

  return {
    name: 'oz-elevenlabs-tts',
    configureServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig(({ mode }) => ({
  /** Load Vite env from repo root so `OPENAI_API_KEY` and `VITE_*` match `/Users/.../Oz-Demo/.env`. */
  envDir: ENV_DIR,
  server: {
    /** Allow opening the app from other devices on the LAN (same `/api/oz/openai` origin as the page). */
    host: true,
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 4173,
    strictPort: false,
    /** DigitalOcean / custom domains send a Host that Vite would otherwise block. */
    allowedHosts: true,
  },
  /** One pdfjs build for `react-pdf` main thread + our worker `?url` import. */
  resolve: { dedupe: ['pdfjs-dist'] },
  plugins: [
    ozRagCallsApiPlugin(mode),
    react(),
    tailwindcss(),
    ozLumberyardApiPlugin(mode),
    ozOpenAiDevProxy(mode),
    ozElevenLabsTtsProxy(mode),
    ozEmailApiPlugin(mode),
  ],
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
  },
}))
