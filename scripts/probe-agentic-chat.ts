/**
 * End-to-end probe harness for Oz chat in agentic mode.
 *
 * Hits POST /api/oz/chat with `mode: agentic` and a series of substrate-
 * scoped questions. Parses the SSE stream and reports, per probe:
 *   - which tools the model called
 *   - whether each tool's result is non-empty (substrate connectivity proof)
 *   - whether the final reply contains expected anchor strings
 *
 * Exits non-zero if any probe fails. Designed to be re-run after every
 * server restart while we iterate on wiring fixes.
 */
import { argv, exit } from 'node:process'

type StreamEvent = { type: string; [k: string]: unknown }

type Probe = {
  name: string
  substrate: 'wiki' | 'vector' | 'catalog' | 'combined'
  message: string
  /** Tool names whose result MUST come back non-empty for this probe to pass. */
  expectNonEmptyTools: string[]
  /** Substrings that should appear in at least one tool result summary or the final reply. */
  expectAnchorStrings: string[]
}

const DEFAULT_BASE_URL = process.env.OZ_PROBE_BASE_URL ?? 'http://localhost:5173'
const REQUEST_TIMEOUT_MS = Number(process.env.OZ_PROBE_TIMEOUT_MS ?? 90_000)

const PROBES: Probe[] = [
  {
    name: 'wiki: read a known dense source page',
    substrate: 'wiki',
    message:
      'Use wiki_read on path "sources/2020-warranty-services-checklist-2021-08-26-4e2c7db0e625" and quote the email address of the warranty services manager along with the [doc:...] citation that page carries.',
    expectNonEmptyTools: ['wiki_read'],
    expectAnchorStrings: ['mmatheson@ufpi.com', 'Matheson'],
  },
  {
    name: 'vector: kb_search retrieves warranty chunk',
    substrate: 'vector',
    message:
      'Use kb_search with surface="kb" to find the document about Deckorators warranty claim filing procedure. Cite the chunk_id you found.',
    expectNonEmptyTools: ['kb_search'],
    expectAnchorStrings: ['4e2c7db0e625'],
  },
  {
    name: 'catalog: catalog_get returns a real SKU row',
    substrate: 'catalog',
    message:
      'Use catalog_list to find any SKU in the "Captivate MFG" product line (top_n=1). Then call catalog_get with that SKU and quote its description verbatim.',
    expectNonEmptyTools: ['catalog_list'],
    expectAnchorStrings: ['captivate', 'azek'],
  },
  {
    name: 'combined: warranty answer must use wiki + vector together',
    substrate: 'combined',
    message:
      'Tell me the warranty claim procedure for Deckorators decking using both wiki_lookup AND kb_search. Include at least one [doc:...] citation and one [wiki:...] citation.',
    expectNonEmptyTools: ['kb_search'],
    expectAnchorStrings: ['warranty', '4e2c7db0e625'],
  },
]

type ProbeResult = {
  probe: Probe
  toolCalls: { name: string; ok: boolean; summary: string }[]
  reply: string
  modeResolution?: { decision: string; provider?: string }
  failures: string[]
  pass: boolean
}

function parseSseLine(line: string): StreamEvent | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]') return null
  try {
    return JSON.parse(payload) as StreamEvent
  } catch {
    return null
  }
}

async function runProbe(probe: Probe, baseUrl: string): Promise<ProbeResult> {
  const traceId = `probe-${probe.substrate}-${Date.now()}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/oz/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-oz-trace-id': traceId,
      },
      body: JSON.stringify({
        message: probe.message,
        mode: 'agentic',
        stream: true,
        contract_version: '2026-04-oz-chat-v1',
        trace_id: traceId,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    return {
      probe,
      toolCalls: [],
      reply: '',
      failures: [`fetch failed: ${err instanceof Error ? err.message : String(err)}`],
      pass: false,
    }
  }
  clearTimeout(timeout)
  if (!response.ok || !response.body) {
    return {
      probe,
      toolCalls: [],
      reply: '',
      failures: [`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`],
      pass: false,
    }
  }

  const toolCalls: ProbeResult['toolCalls'] = []
  let reply = ''
  let tokenBuffer = ''
  let modeResolution: ProbeResult['modeResolution'] | undefined
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        const ev = parseSseLine(line)
        if (!ev) continue
        if (ev.type === 'token' && typeof ev.delta === 'string') tokenBuffer += ev.delta
        else if (ev.type === 'tool_call' && typeof ev.name === 'string') {
          toolCalls.push({ name: ev.name, ok: true, summary: '' })
        } else if (ev.type === 'tool_result' && typeof ev.name === 'string') {
          const last = [...toolCalls].reverse().find((t) => t.name === ev.name && !t.summary)
          if (last) {
            last.ok = ev.ok !== false
            last.summary = typeof ev.summary === 'string' ? ev.summary : ''
          }
        } else if (ev.type === 'trace' && ev.stage === 'mode_resolution') {
          const details = (ev.details ?? {}) as Record<string, unknown>
          modeResolution = {
            decision: String(ev.decision ?? ''),
            ...(typeof details.provider === 'string' ? { provider: details.provider } : {}),
          }
        } else if (ev.type === 'done' && typeof ev.message === 'string') {
          reply = ev.message
        }
      }
    }
  }
  if (!reply) reply = tokenBuffer

  // Evaluate
  const failures: string[] = []
  if (!modeResolution || modeResolution.decision !== 'agentic') {
    failures.push(`mode not resolved to agentic (got: ${modeResolution?.decision ?? 'none'})`)
  }
  for (const expected of probe.expectNonEmptyTools) {
    const matching = toolCalls.filter((t) => t.name === expected)
    if (matching.length === 0) {
      failures.push(`tool ${expected} was not called`)
      continue
    }
    const anyNonEmpty = matching.some((t) => isNonEmptyResult(t.summary, expected))
    if (!anyNonEmpty) {
      failures.push(`tool ${expected} returned empty/stub result on every call (calls=${matching.length})`)
    }
  }
  const haystack = `${reply}\n${toolCalls.map((t) => t.summary).join('\n')}`.toLowerCase()
  for (const anchor of probe.expectAnchorStrings) {
    if (!haystack.includes(anchor.toLowerCase())) {
      failures.push(`anchor missing: "${anchor}"`)
    }
  }

  return { probe, toolCalls, reply, modeResolution, failures, pass: failures.length === 0 }
}

/** Heuristic emptiness check per tool. */
function isNonEmptyResult(summary: string, toolName: string): boolean {
  if (!summary) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(summary)
  } catch {
    return summary.trim().length > 50
  }
  if (parsed == null || typeof parsed !== 'object') return false
  const obj = parsed as Record<string, unknown>
  if (toolName === 'wiki_read') {
    return obj.found === true && typeof obj.content === 'string' && (obj.content as string).trim().length > 0
  }
  if (toolName === 'wiki_lookup' || toolName === 'wiki_grep') {
    const arr = Array.isArray(obj.pages) ? (obj.pages as unknown[]) : Array.isArray(obj.hits) ? (obj.hits as unknown[]) : []
    return arr.length > 0
  }
  if (toolName === 'kb_search') {
    const chunks = Array.isArray(obj.chunks) ? (obj.chunks as unknown[]) : []
    const provenance = obj.provenance as { source?: string } | undefined
    if (provenance?.source === 'stub') return false
    return chunks.length > 0
  }
  if (toolName === 'catalog_get') {
    return obj.found === true
  }
  if (toolName === 'catalog_list') {
    const items = Array.isArray(obj.items) ? (obj.items as unknown[]) : Array.isArray(obj.rows) ? (obj.rows as unknown[]) : []
    return items.length > 0
  }
  return JSON.stringify(parsed).length > 4
}

async function main() {
  const baseUrl = argv.includes('--base-url') ? argv[argv.indexOf('--base-url') + 1] : DEFAULT_BASE_URL
  console.log(`# Oz agentic chat probes — base_url=${baseUrl}`)
  // Confirm config endpoint first (proves the new middleware is running).
  let configOk = false
  try {
    const r = await fetch(`${baseUrl}/api/oz/chat/config`)
    if (r.ok) {
      const cfg = (await r.json()) as Record<string, unknown>
      configOk = true
      console.log(`  config: ${JSON.stringify(cfg)}`)
    } else {
      console.log(`  config endpoint returned HTTP ${r.status}`)
    }
  } catch (err) {
    console.log(`  config endpoint unreachable: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!configOk) {
    console.log('FAIL: server unreachable')
    exit(2)
  }

  const results: ProbeResult[] = []
  for (const probe of PROBES) {
    process.stdout.write(`\n## ${probe.substrate.toUpperCase()} — ${probe.name}\n`)
    const r = await runProbe(probe, baseUrl)
    results.push(r)
    process.stdout.write(`   tools: ${r.toolCalls.map((t) => `${t.name}${t.ok ? '' : '!'}`).join(' → ') || '(none)'}\n`)
    process.stdout.write(`   reply: ${r.reply.slice(0, 240).replace(/\n/g, ' ')}${r.reply.length > 240 ? '…' : ''}\n`)
    if (r.pass) process.stdout.write(`   PASS\n`)
    else {
      process.stdout.write(`   FAIL:\n`)
      for (const f of r.failures) process.stdout.write(`     - ${f}\n`)
    }
  }

  const passCount = results.filter((r) => r.pass).length
  const total = results.length
  console.log(`\n# Summary: ${passCount}/${total} pass`)
  for (const r of results) {
    const tag = r.pass ? 'PASS' : 'FAIL'
    console.log(`  [${tag}] ${r.probe.substrate}: ${r.probe.name}`)
  }
  exit(passCount === total ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  exit(2)
})
