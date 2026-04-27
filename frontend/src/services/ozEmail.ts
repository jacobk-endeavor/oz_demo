/**
 * Browser-side email-send helper. Posts to the dev-server email proxy at
 * `/api/oz/email`, which uses Nodemailer + SMTP to actually deliver the
 * message. SMTP credentials live in the repo `.env` (see `.env.example` for
 * the SMTP_* set the proxy reads).
 */

export interface SendOzEmailRequest {
  to?: string | string[]
  subject: string
  html?: string
  text?: string
}

export interface SendOzEmailResult {
  ok: boolean
  messageId?: string
  accepted?: unknown
  error?: string
}

export async function sendOzEmail(req: SendOzEmailRequest): Promise<SendOzEmailResult> {
  if (!req.html && !req.text) {
    return { ok: false, error: 'Email body required (html or text).' }
  }
  let r: Response
  try {
    r = await fetch('/api/oz/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  let payload: unknown = null
  try {
    payload = await r.json()
  } catch {
    /* ignore non-JSON */
  }
  if (!r.ok) {
    const err =
      (payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : null) ?? `HTTP ${r.status}`
    return { ok: false, error: err }
  }
  const obj = (payload ?? {}) as Partial<SendOzEmailResult>
  return {
    ok: true,
    messageId: typeof obj.messageId === 'string' ? obj.messageId : undefined,
    accepted: obj.accepted,
  }
}
