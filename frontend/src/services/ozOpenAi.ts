/**
 * OpenAI chat completions for the Oz “Ask” panel.
 *
 * - **Development / preview:** calls `POST /api/oz/openai` (Vite adds a server that reads `OPENAI_API_KEY` from
 *   the repo or `frontend/.env` — no key in the browser).
 * - **Production build (no dev server):** set `VITE_OPENAI_API_KEY` for a direct request (CORS may block; use
 *   a real backend in production).
 */
const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions'

export type OzOpenAiRole = 'system' | 'user' | 'assistant'

export type OzOpenAiMessage = { role: OzOpenAiRole; content: string }

const DEFAULT_MODEL = 'gpt-4o'

function hasViteKey(): boolean {
  const k = import.meta.env.VITE_OPENAI_API_KEY
  return typeof k === 'string' && k.trim().length > 0
}

/** When true, `App` will call the model; connection still depends on a server key in dev. */
export function isOpenAiConfigured(): boolean {
  if (import.meta.env.VITEST) return false
  return import.meta.env.DEV || hasViteKey()
}

const OZ_SYSTEM = `You are **Oz** in Endeavor’s **Oz** command center (demo). You help sales and ops with accounts, lead lists, routes, and next steps. Replies: concise, clear, a little warmth; use **markdown** (bold, short bullets) when it helps.

When a **## Distributor lead list** (TSV) block is included in the system message, that snapshot is the **source of truth** for Q&A: read it for counts, top accounts, source mix, and comparisons, and **cite by row #** (e.g. “rows 2–4”). The same message may also describe **list state / sort** and what the in-app “handler” just did—honor that. If the TSV is missing, still help with high-level next steps, but do not make up table rows. Never invent private CRM or customer data.`

export function buildOzGptSystemPrompt(): string {
  return OZ_SYSTEM
}

function parseContent(data: unknown): string {
  const d = data as { choices?: { message?: { content?: string } }[] }
  const text = d.choices?.[0]?.message?.content
  if (!text?.trim()) throw new Error('OpenAI returned empty content')
  return text.trim()
}

export type OpenAiChatOptions = {
  model?: string
  maxTokens?: number
  /** Lower temperature (e.g. 0.2) for JSON / tool-like outputs. */
  temperature?: number
  /** `json_object` forces a JSON message (add to prompt: “return JSON only”). */
  responseFormat?: 'text' | 'json_object'
}

/**
 * @throws on network error, HTTP error, or empty content
 */
export async function fetchOpenAiChatCompletion(
  messages: OzOpenAiMessage[],
  options?: OpenAiChatOptions,
): Promise<string> {
  if (import.meta.env.VITEST) {
    throw new Error('openai disabled in test')
  }
  const model =
    options?.model ?? (import.meta.env.VITE_OPENAI_MODEL?.trim() || DEFAULT_MODEL)
  const max_tokens = options?.maxTokens ?? 1_200
  const temperature = options?.temperature ?? 0.45
  const payload: Record<string, unknown> = { model, messages, temperature, max_tokens }
  if (options?.responseFormat === 'json_object') {
    payload.response_format = { type: 'json_object' }
  }
  const body = JSON.stringify(payload)

  if (import.meta.env.DEV) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 60_000)
    const res = await fetch('/api/oz/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ac.signal,
    })
    clearTimeout(t)
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`OpenAI proxy ${res.status}: ${t.slice(0, 200)}`)
    }
    return parseContent(await res.json())
  }

  const key = import.meta.env.VITE_OPENAI_API_KEY
  if (!key?.trim()) {
    throw new Error('VITE_OPENAI_API_KEY is not set (or run `npm run dev` with OPENAI in .env for the dev proxy).')
  }
  const res = await fetch(OPENAI_CHAT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key.trim()}`,
    },
    body,
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`OpenAI ${res.status}: ${errBody.slice(0, 200)}`)
  }
  return parseContent(await res.json())
}

/**
 * Chat completion with `response_format: json_object` (model must be instructed to return one JSON object).
 * @returns parsed JSON
 */
export async function fetchOpenAiJsonObject(
  messages: OzOpenAiMessage[],
  options?: Omit<OpenAiChatOptions, 'responseFormat' | 'temperature'> & { maxTokens?: number; temperature?: number },
): Promise<unknown> {
  const text = await fetchOpenAiChatCompletion(messages, {
    ...options,
    responseFormat: 'json_object',
    temperature: options?.temperature ?? 0.2,
    maxTokens: options?.maxTokens ?? 1_000,
  })
  return JSON.parse(text) as unknown
}
