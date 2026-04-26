import { createReadStream, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  buildCompetitorOfferRows,
  productQueriesFromTopCalls,
} from './src/features/lumberyard/competitorOffersBuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const LUMBER = path.join(REPO_ROOT, 'lumberyard-calls')
const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions'
const BRAVE = 'https://api.search.brave.com/res/v1/web/search'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function openAiKey(mode: string): string | undefined {
  const fe = loadEnv(mode, __dirname, '')
  const root = loadEnv(mode, REPO_ROOT, '')
  return (fe.OPENAI_API_KEY || fe.VITE_OPENAI_API_KEY || root.OPENAI_API_KEY || root.VITE_OPENAI_API_KEY)?.trim()
}

function braveKey(mode: string): string | undefined {
  const root = loadEnv(mode, REPO_ROOT, '')
  return (root.BRAVE_SEARCH_API_KEY || root.BRAVE_API_KEY)?.trim()
}

type ManifestCall = {
  id: string
  callDate?: string
  source?: 'call_recording' | 'email' | 'field_notes'
  location?: string
  customerName?: string
  title: string
  productTags?: string[]
  tags: string[]
  notable: string[]
  repPersona: string
  customerPersona: string
  transcript: string
  audio: string | null
  contentSha256?: string
  durationSec?: number
}

type LibraryRow = {
  id: string
  source: 'call_recording' | 'field_notes' | 'email'
  callDate?: string
  title: string
  customerName: string
  location: string
  productTags?: string[]
  tags: string[]
  notable: string[]
  repPersona: string
  customerPersona: string
  transcript: string
  audio: string | null
  transcriptText: string
  audioUrl: string | null
  transcriptPath: string
  durationSec?: number | null
  emailTranscript?: string
  fieldNotesText?: string
}

type ActivityMockEntry = {
  id: string
  source: 'email' | 'field_notes'
  callDate: string
  title: string
  customerName: string
  location: string
  productTags: string[]
  repPersona: string
  customerPersona: string
  tags: string[]
  notable: string[]
  emailTranscript?: string
  fieldNotesText?: string
}

function nameFromPersona(persona: string): string {
  return persona.split(/\s*[—–]\s*/)[0]?.trim() || persona.trim()
}

function loadActivityMockEntries(): ActivityMockEntry[] {
  const f = path.join(LUMBER, 'activity-mock.json')
  if (!existsSync(f)) return []
  try {
    const raw = JSON.parse(readFileSync(f, 'utf8')) as { entries?: ActivityMockEntry[] }
    return Array.isArray(raw.entries) ? raw.entries : []
  } catch {
    return []
  }
}

function rowFromActivity(e: ActivityMockEntry): LibraryRow {
  const body =
    e.source === 'email' ? (e.emailTranscript ?? '') : (e.fieldNotesText ?? e.emailTranscript ?? '')
  return {
    id: e.id,
    source: e.source,
    callDate: e.callDate,
    title: e.title,
    customerName: e.customerName,
    location: e.location,
    productTags: e.productTags,
    tags: e.tags,
    notable: e.notable,
    repPersona: e.repPersona,
    customerPersona: e.customerPersona,
    transcript: '',
    audio: null,
    transcriptText: body,
    audioUrl: null,
    transcriptPath: e.source,
    durationSec: null,
    emailTranscript: e.emailTranscript,
    fieldNotesText: e.fieldNotesText,
  }
}

function rowFromManifestCall(
  c: ManifestCall,
  transcriptText: string,
  audioUrl: string | null,
  transcriptPath: string,
): LibraryRow {
  return {
    id: c.id,
    source: 'call_recording',
    callDate: c.callDate,
    title: c.title,
    customerName: c.customerName?.trim() || nameFromPersona(c.customerPersona),
    location: c.location?.trim() ?? '',
    productTags: c.productTags,
    tags: c.tags,
    notable: c.notable,
    repPersona: c.repPersona,
    customerPersona: c.customerPersona,
    transcript: c.transcript,
    audio: c.audio,
    transcriptText,
    audioUrl,
    transcriptPath,
    durationSec: c.durationSec ?? null,
  }
}

type Manifest = {
  calls: ManifestCall[]
}

function loadTelemetry(): unknown {
  const p = path.join(LUMBER, 'synthetic-telemetry.json')
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as unknown
}

function getCallsWithTranscripts(manifest: Manifest) {
  return manifest.calls.map((c) => {
    const filePath = path.join(REPO_ROOT, c.transcript)
    const transcriptText = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
    const base = c.audio ? path.basename(c.audio) : null
    const audioUrl = base ? `/api/oz/lumberyard-assets/audio/${encodeURIComponent(base)}` : null
    return { ...c, transcriptText, audioUrl, transcriptPath: c.transcript }
  })
}

function buildLibraryRows(manifest: Manifest): LibraryRow[] {
  const fromCalls = getCallsWithTranscripts(manifest).map((c) =>
    rowFromManifestCall(c, c.transcriptText, c.audioUrl, c.transcriptPath),
  )
  const fromActivity = loadActivityMockEntries().map(rowFromActivity)
  const merged = [...fromCalls, ...fromActivity]
  merged.sort((a, b) => {
    const da = a.callDate ?? ''
    const db = b.callDate ?? ''
    if (db !== da) return db.localeCompare(da)
    return a.id.localeCompare(b.id)
  })
  return merged
}

function allTranscriptCorpus(manifest: Manifest): string {
  return buildLibraryRows(manifest)
    .map(
      (r) =>
        `### ${r.id} [${r.source}]: ${r.title}\n<transcript>\n${r.transcriptText}\n</transcript>\n`,
    )
    .join('\n')
}

function shouldSearchWeb(userMessage: string): boolean {
  const t = userMessage.toLowerCase()
  return /website|\.com|online|competitor|sell(ing)?|who (carries|sells|stocks)/.test(t)
}

function firstHttpsUrlInText(block: string): string | null {
  const m = block.match(/https?:\/\/[^\s)\]>"']+/g)
  if (!m || !m[0]) return null
  return m[0].replace(/[.,;:!?)]+$/, '')
}

async function braveWebSearch(q: string, key: string): Promise<string> {
  const u = new URL(BRAVE)
  u.searchParams.set('q', q)
  u.searchParams.set('count', '5')
  const r = await fetch(u.toString(), { headers: { 'X-Subscription-Token': key, Accept: 'application/json' } })
  if (!r.ok) {
    return `(Brave search failed: HTTP ${r.status})`
  }
  const d = (await r.json()) as { web?: { results?: { title: string; url: string; description: string }[] } }
  const res = d.web?.results ?? []
  if (res.length === 0) return '(No web results found.)'
  return res
    .map(
      (x, i) =>
        `${i + 1}. **${x.title}** — ${x.url}\n   ${(x.description ?? '').slice(0, 240)}${(x.description?.length ?? 0) > 240 ? '…' : ''}`,
    )
    .join('\n')
}

const INTEL_SYSTEM = `You are **Oz** in a lumberyard / building-supply **sales intelligence** demo. You have:
1) Full **call transcripts** (synthetic role-play) in the user’s message, tagged by call id.
2) **Synthetic roll-up data** (revenue by product group, provenance) that *simulates* merged CRM + field notes + call center + **Outlook** + **Teams**—treat the JSON as the quantitative source for "what % of sales" style questions, and state clearly that percentages are **demo / illustrative** not audited financials.
3) Optional **web search** snippets about whether competitors list products on their websites.

Rules:
- Answer in **clear markdown** (use **bold**, bullet lists, and **markdown tables** when comparing products or percentages).
- Cite which **call id** (e.g. \`lumber-01-...\`) supports a claim when you use transcript evidence.
- For competitor **website** / catalog questions: use the web snippets if provided; if missing, say you do not have live search enabled and still answer from transcripts + general knowledge, marking uncertainty.
- Never invent private customer PII.`

export function ozLumberyardApiPlugin(mode: string) {
  async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const fullUrl = req.url?.split('?')[0] ?? ''
    if (fullUrl === '/api/oz/lumberyard-calls' && req.method === 'GET') {
      if (!existsSync(LUMBER)) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'lumberyard-calls directory not found' }))
        return
      }
      const mpath = path.join(LUMBER, 'call-library.json')
      if (!existsSync(mpath)) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'call-library.json missing; run generate-audio script' }))
        return
      }
      const manifest = JSON.parse(readFileSync(mpath, 'utf8')) as Manifest
      const synthetic = loadTelemetry()
      const calls = buildLibraryRows(manifest)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, version: 1, synthetic, calls }))
      return
    }

    if (fullUrl.startsWith('/api/oz/lumberyard-assets/audio/') && req.method === 'GET') {
      const raw = fullUrl.replace('/api/oz/lumberyard-assets/audio/', '')
      const base = path.basename(decodeURIComponent(raw))
      if (!/^[a-zA-Z0-9._-]+\.mp3$/.test(base)) {
        res.statusCode = 400
        res.end('Bad filename')
        return
      }
      const fpath = path.join(LUMBER, 'audio', base)
      if (!existsSync(fpath)) {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'audio/mpeg')
      createReadStream(fpath).pipe(res)
      return
    }

    if (fullUrl === '/api/oz/competitor-offers' && req.method === 'POST') {
      const bKey = braveKey(mode)
      type InRow = { id: string; title: string; productTags: string[] }
      let topCalls: InRow[] = []
      try {
        const body = JSON.parse(await readBody(req)) as { rows?: InRow[] }
        topCalls = Array.isArray(body.rows) ? body.rows : []
      } catch {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }))
        return
      }
      const productQueries = productQueriesFromTopCalls(
        topCalls.map((r) => ({
          productTags: r.productTags,
          title: r.title,
        })),
        5,
        5,
      )
      const qList =
        productQueries.length > 0
          ? productQueries
          : [topCalls[0]?.title?.trim() || 'Lumber and building materials']
      const webByProduct: Record<string, { url: string; title: string }> = {}
      if (bKey) {
        for (const p of qList.slice(0, 3)) {
          const block = await braveWebSearch(
            `buy ${p} in stock home depot OR lowes site:.com list price`,
            bKey,
          )
          const url = firstHttpsUrlInText(block)
          if (url) {
            const titleLine = block.split('\n').find((l) => l.includes('**') && l.includes('http')) ?? p
            webByProduct[p] = { url, title: titleLine.replace(/\*+/g, '').slice(0, 80) }
          }
        }
      }
      const rows = buildCompetitorOfferRows(qList, webByProduct)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ok: true,
          rows,
          usedWebSearch: Boolean(bKey && Object.keys(webByProduct).length > 0),
          productQueries: qList,
        }),
      )
      return
    }

    if (fullUrl === '/api/oz/lumberyard-intel' && req.method === 'POST') {
      const key = openAiKey(mode)
      if (!key) {
        res.statusCode = 503
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: 'Set OPENAI_API_KEY in repo .env for lumberyard Q&A (same as Oz chat).',
          }),
        )
        return
      }
      const mpath = path.join(LUMBER, 'call-library.json')
      if (!existsSync(mpath)) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'call-library.json missing' }))
        return
      }
      const manifest = JSON.parse(readFileSync(mpath, 'utf8')) as Manifest
      const telemetry = loadTelemetry()
      const corpus = allTranscriptCorpus(manifest)
      const telemetryBlock =
        telemetry != null
          ? `\n## Synthetic roll-up (Outlook / Teams / field / call-center style merge)\n\`\`\`json\n${JSON.stringify(telemetry, null, 2)}\n\`\`\`\n`
          : ''
      let body: { userMessage?: string; history?: { role: 'user' | 'assistant'; content: string }[] }
      try {
        body = JSON.parse(await readBody(req)) as typeof body
      } catch {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'Invalid JSON' }))
        return
      }
      const userMessage = (body.userMessage ?? '').trim()
      if (!userMessage) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'userMessage required' }))
        return
      }
      let webBlock = ''
      const bKey = braveKey(mode)
      if (bKey && shouldSearchWeb(userMessage)) {
        const snippet = await braveWebSearch(
          // Pull product / competitor context from a short user question
          userMessage.slice(0, 200),
          bKey,
        )
        webBlock = `\n## Web (Brave) snippets\n${snippet}\n`
      } else if (shouldSearchWeb(userMessage) && !bKey) {
        webBlock = `\n## Web\n(No live search key configured. Answer from transcripts + known public facts; be explicit about limitations.)\n`
      }

      const userContent = `## All activity text (phone transcripts, field voice notes, email threads) [source on each block]\n${corpus}\n${telemetryBlock}${webBlock}\n## User question\n${userMessage}`

      const hist = Array.isArray(body.history) ? body.history.slice(-8) : []
      const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: INTEL_SYSTEM },
        ...hist.map((h) => ({ role: h.role, content: h.content } as const)),
        { role: 'user', content: userContent },
      ]

      const r = await fetch(OPENAI_CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          temperature: 0.35,
          max_tokens: 3_200,
          messages,
        }),
      })
      const text = await r.text()
      if (!r.ok) {
        res.statusCode = r.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'OpenAI error', body: text.slice(0, 500) }))
        return
      }
      const json = JSON.parse(text) as { choices?: { message?: { content?: string } }[] }
      const reply = json.choices?.[0]?.message?.content?.trim() ?? ''
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          reply,
          usedWebSearch: Boolean(bKey && shouldSearchWeb(userMessage)),
        }),
      )
      return
    }

    next()
  }

  return {
    name: 'oz-lumberyard-api',
    configureServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server: { middlewares: { use: (fn: typeof handler) => void } }) {
      server.middlewares.use(handler)
    },
  }
}
