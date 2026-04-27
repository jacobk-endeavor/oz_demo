/**
 * Dev/preview server middleware plugin for `/api/oz/email`.
 *
 * Browsers can't speak SMTP, so the Field App's voice flow posts to this Vite
 * middleware instead. The middleware reads SMTP_* env vars (repo root `.env`
 * or `frontend/.env`), spins up a Nodemailer transport, and sends the email.
 *
 * Wire-up:
 *   - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — required.
 *   - SMTP_SECURE — "true" (default) for port 465 / SSL; "false" for 587 / STARTTLS.
 *   - SMTP_FROM — defaults to SMTP_USER if unset.
 *   - SMTP_TO_DEFAULT — used when the request body omits `to`.
 *
 * Triggered by the "Ok, sending" turn in the orb script queue (Script 2 turn 4),
 * which calls `sendOzEmail()` in `frontend/src/services/ozEmail.ts`.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import nodemailer, { type Transporter } from 'nodemailer'
import type { IncomingMessage, ServerResponse } from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

interface SmtpEnv {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  defaultTo: string
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function readSmtpEnv(mode: string): SmtpEnv | { error: string } {
  const fe = loadEnv(mode, __dirname, '')
  const root = loadEnv(mode, REPO_ROOT, '')
  const get = (k: string): string => (fe[k] || root[k] || '').trim()

  const host = get('SMTP_HOST')
  const portStr = get('SMTP_PORT')
  const user = get('SMTP_USER')
  const pass = get('SMTP_PASS')
  if (!host || !user || !pass) {
    return {
      error:
        'SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in ' +
        REPO_ROOT +
        '/.env (or frontend/.env) and restart the dev server. See .env.example for defaults.',
    }
  }
  const portNum = Number.parseInt(portStr || '465', 10)
  const port = Number.isFinite(portNum) ? portNum : 465
  const secureRaw = get('SMTP_SECURE')
  // Default: secure (SSL) when port 465, else STARTTLS-style.
  const secure = secureRaw ? secureRaw.toLowerCase() === 'true' : port === 465

  return {
    host,
    port,
    secure,
    user,
    pass,
    from: get('SMTP_FROM') || user,
    defaultTo: get('SMTP_TO_DEFAULT') || user,
  }
}

let cachedTransporter: { key: string; t: Transporter } | null = null
function transporterFor(env: SmtpEnv): Transporter {
  const key = `${env.host}|${env.port}|${env.secure}|${env.user}`
  if (cachedTransporter && cachedTransporter.key === key) return cachedTransporter.t
  const t = nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: { user: env.user, pass: env.pass },
  })
  cachedTransporter = { key, t }
  return t
}

interface EmailRequestBody {
  to?: string | string[]
  subject?: string
  html?: string
  text?: string
}

function sanitizeRecipients(value: unknown, fallback: string): string[] {
  if (Array.isArray(value)) {
    const list = value.filter((v): v is string => typeof v === 'string' && v.includes('@'))
    return list.length > 0 ? list : [fallback]
  }
  if (typeof value === 'string' && value.includes('@')) {
    return [value]
  }
  return [fallback]
}

export function ozEmailApiPlugin(mode: string) {
  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = req.url?.split('?')[0] ?? ''
    if (url !== '/api/oz/email') {
      next()
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    const env = readSmtpEnv(mode)
    if ('error' in env) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: env.error }))
      return
    }
    let body: EmailRequestBody
    try {
      const raw = await readBody(req)
      body = raw ? (JSON.parse(raw) as EmailRequestBody) : {}
    } catch (e) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Invalid JSON body: ' + String(e) }))
      return
    }
    const subject = (body.subject ?? '').trim() || '(no subject)'
    const html = (body.html ?? '').trim()
    const text = (body.text ?? '').trim()
    if (!html && !text) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Email body required (html or text).' }))
      return
    }
    const to = sanitizeRecipients(body.to, env.defaultTo)
    try {
      const t = transporterFor(env)
      const info = await t.sendMail({
        from: env.from,
        to,
        subject,
        html: html || undefined,
        text: text || (html ? html.replace(/<[^>]+>/g, ' ') : undefined),
      })
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, messageId: info.messageId, accepted: info.accepted }))
    } catch (e) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
    }
  }

  return {
    name: 'oz-email-proxy',
    configureServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
  }
}
