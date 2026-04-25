type HttpMethod = 'GET' | 'POST'

interface DemoCitation {
  kind: 'obs' | 'conc'
  id: string
  statement: string
  layer: number
  category: string
  doc_slug: string | null
  wikilink: string
}

interface DemoTurn {
  turn_id: string
  timestamp: string
  role: 'user' | 'assistant'
  content: string
  citations?: DemoCitation[]
}

interface DemoSession {
  session_id: string
  title: string
  started_at: string
  updated_at: string
  turns: DemoTurn[]
}

interface DemoGraphNode {
  id: string
  label: string
  statement: string
  layer: number
  category: string
  doc_slug: string | null
}

interface DemoGraphEdge {
  source: string
  target: string
  relation: string
}

const DEMO_MODE_VALUE = String(
  (import.meta as ImportMeta & { env?: Record<string, unknown> }).env
    ?.VITE_DEMO_MODE ?? '',
).toLowerCase()

export const isDemoMode = ['1', 'true', 'yes', 'on'].includes(DEMO_MODE_VALUE)

const graphNodes: DemoGraphNode[] = [
  {
    id: 'obs_field_notes_001',
    label: 'Field note',
    statement:
      'Northwind Grocery mentioned repeat stockouts on insulated delivery bags during Monday morning routes.',
    layer: 1,
    category: 'field-notes',
    doc_slug: 'northwind-visit-notes',
  },
  {
    id: 'obs_call_mining_001',
    label: 'Call mining',
    statement:
      'Three recent calls from food-service accounts ask whether Oz can flag replenishment risk before delivery windows close.',
    layer: 1,
    category: 'call-mining',
    doc_slug: 'support-call-rollup',
  },
  {
    id: 'obs_quote_001',
    label: 'Quote request',
    statement:
      'A regional buyer requested a same-day quote for cold-chain kits with branded labels and rush freight.',
    layer: 2,
    category: 'quote-automation',
    doc_slug: 'quote-automation-demo',
  },
  {
    id: 'conc_route_001',
    label: 'Route opportunity',
    statement:
      'Nearby grocery and catering accounts should be grouped into a Thursday route for cross-sell outreach.',
    layer: 3,
    category: 'lead-generation',
    doc_slug: 'lead-generation-reporting',
  },
  {
    id: 'conc_dashboard_001',
    label: 'Dashboard trigger',
    statement:
      'The strongest dashboard story is fill-rate leakage by product line, followed by revenue at risk.',
    layer: 4,
    category: 'dashboard-generation',
    doc_slug: 'dashboard-generation-demo',
  },
]

const graphEdges: DemoGraphEdge[] = [
  { source: 'obs_call_mining_001', target: 'obs_field_notes_001', relation: 'corroborates' },
  { source: 'obs_quote_001', target: 'obs_field_notes_001', relation: 'supports' },
  { source: 'conc_route_001', target: 'obs_call_mining_001', relation: 'cites' },
  { source: 'conc_dashboard_001', target: 'obs_field_notes_001', relation: 'cites' },
  { source: 'conc_dashboard_001', target: 'obs_quote_001', relation: 'cites' },
]

const defaultCitations: DemoCitation[] = [
  {
    kind: 'obs',
    id: 'obs_field_notes_001',
    statement: graphNodes[0].statement,
    layer: graphNodes[0].layer,
    category: graphNodes[0].category,
    doc_slug: graphNodes[0].doc_slug,
    wikilink: '[[obs_field_notes_001]]',
  },
  {
    kind: 'conc',
    id: 'conc_dashboard_001',
    statement: graphNodes[4].statement,
    layer: graphNodes[4].layer,
    category: graphNodes[4].category,
    doc_slug: graphNodes[4].doc_slug,
    wikilink: '[[conc_dashboard_001]]',
  },
]

const sessions = new Map<string, DemoSession>()

function nowIso(): string {
  return new Date().toISOString()
}

function createSeedSession(): DemoSession {
  const timestamp = nowIso()
  return {
    session_id: 'demo-session-001',
    title: 'Demo workflow briefing',
    started_at: timestamp,
    updated_at: timestamp,
    turns: [
      {
        turn_id: 'demo-turn-001',
        timestamp,
        role: 'user',
        content: 'What should I show first in the Oz demo?',
      },
      {
        turn_id: 'demo-turn-002',
        timestamp,
        role: 'assistant',
        content:
          'Start with field notes, then pivot to the graph so the audience sees Oz turning scattered sales signals into prioritized actions.',
        citations: defaultCitations,
      },
    ],
  }
}

function ensureSeedSession() {
  if (sessions.size === 0) {
    const seed = createSeedSession()
    sessions.set(seed.session_id, seed)
  }
}

function makeTitle(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) return 'New demo conversation'
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}...` : trimmed
}

function buildAssistantReply(message: string): string {
  const prompt = message.trim()
  if (!prompt) {
    return 'I am ready to walk through the local Oz demo. Try asking about field notes, graph insights, quotes, or lead routing.'
  }

  return `Demo mode is using seeded Oz knowledge. For "${prompt}", I would surface the stockout signal, connect it to recent call-mining evidence, and recommend a route or dashboard action with citations.`
}

function handleChatPost(body: unknown) {
  const payload = body as { message?: unknown; session_id?: unknown }
  const message = typeof payload.message === 'string' ? payload.message : ''
  const requestedSessionId =
    typeof payload.session_id === 'string' ? payload.session_id : null
  const timestamp = nowIso()
  const sessionId = requestedSessionId ?? `demo-session-${Date.now()}`
  const session =
    sessions.get(sessionId) ??
    {
      session_id: sessionId,
      title: makeTitle(message),
      started_at: timestamp,
      updated_at: timestamp,
      turns: [],
    }

  session.turns.push({
    turn_id: `demo-turn-${session.turns.length + 1}`,
    timestamp,
    role: 'user',
    content: message,
  })
  session.turns.push({
    turn_id: `demo-turn-${session.turns.length + 1}`,
    timestamp,
    role: 'assistant',
    content: buildAssistantReply(message),
    citations: defaultCitations,
  })
  session.updated_at = timestamp
  if (!session.title) session.title = makeTitle(message)
  sessions.set(sessionId, session)

  return {
    reply: session.turns.at(-1)?.content ?? '',
    citations: defaultCitations,
    session_id: sessionId,
  }
}

function handleGraphGet(url: URL) {
  const category = url.searchParams.get('category') ?? ''
  const layerParam = url.searchParams.get('layers')
  const layerSet = layerParam
    ? new Set(
        layerParam
          .split(',')
          .map((l) => Number(l))
          .filter((l) => Number.isInteger(l)),
      )
    : null

  const nodes = graphNodes.filter((node) => {
    if (category && node.category !== category) return false
    if (layerSet && !layerSet.has(node.layer)) return false
    return true
  })
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = graphEdges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  )

  return { nodes, edges, truncated: false }
}

export function getDemoResponse<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
): T | undefined {
  ensureSeedSession()

  const url = new URL(path, window.location.origin)
  if (method === 'POST' && url.pathname === '/api/chat') {
    return handleChatPost(body) as T
  }

  if (method === 'GET' && url.pathname === '/api/chat/sessions') {
    return {
      sessions: [...sessions.values()]
        .map(({ session_id, title, updated_at, started_at }) => ({
          session_id,
          title,
          updated_at,
          started_at,
        }))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    } as T
  }

  if (method === 'GET' && url.pathname.startsWith('/api/chat/sessions/')) {
    const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')
    return sessions.get(id) as T | undefined
  }

  if (method === 'GET' && url.pathname === '/api/graph') {
    return handleGraphGet(url) as T
  }

  return undefined
}
