export type GraphToolName = 'graph_search' | 'graph_neighbors'

export type GraphTraversalLimits = {
  maxDepth: number
  maxResultSize: number
  maxNeighborsPerNode: number
  allowedScopes: string[]
}

export type GraphSearchRequest = {
  query: string
  depth?: number
  size?: number
  scope?: string
}

export type GraphNeighborRequest = {
  nodeId: string
  depth?: number
  size?: number
  scope?: string
}

export type EnforcedGraphSearchRequest = {
  query: string
  depth: number
  size: number
  scope: string
}

export type EnforcedGraphNeighborRequest = {
  nodeId: string
  depth: number
  size: number
  scope: string
}

export type GraphNode = {
  id: string
  label: string
}

export type GraphEdge = {
  from: string
  to: string
  relation: string
}

export type GraphSearchResult = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  meta: {
    tool: GraphToolName
    limited: boolean
    depth: number
    size: number
    scope: string
  }
}

export type GraphNeighborResult = GraphSearchResult

export type GraphSearchAdapter = {
  search(request: EnforcedGraphSearchRequest): Promise<GraphSearchResult>
}

export type GraphNeighborsAdapter = {
  neighbors(request: EnforcedGraphNeighborRequest): Promise<GraphNeighborResult>
}

export const DEFAULT_GRAPH_LIMITS: GraphTraversalLimits = {
  maxDepth: 2,
  maxResultSize: 20,
  maxNeighborsPerNode: 10,
  allowedScopes: ['default'],
}

function clampPositiveInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  const rounded = Math.floor(value as number)
  if (rounded < 1) return 1
  return rounded > max ? max : rounded
}

function normalizeScope(scope: string | undefined, allowedScopes: string[]): string {
  const normalized = String(scope ?? '').trim()
  if (!normalized) return allowedScopes[0] ?? DEFAULT_GRAPH_LIMITS.allowedScopes[0]
  return allowedScopes.includes(normalized) ? normalized : allowedScopes[0] ?? normalized
}

export function applyGraphSearchLimits(
  request: GraphSearchRequest,
  limits: GraphTraversalLimits,
): EnforcedGraphSearchRequest {
  return {
    query: String(request.query ?? '').trim(),
    depth: clampPositiveInteger(request.depth, 1, limits.maxDepth),
    size: clampPositiveInteger(request.size, 10, limits.maxResultSize),
    scope: normalizeScope(request.scope, limits.allowedScopes),
  }
}

export function applyGraphNeighborLimits(
  request: GraphNeighborRequest,
  limits: GraphTraversalLimits,
): EnforcedGraphNeighborRequest {
  return {
    nodeId: String(request.nodeId ?? '').trim(),
    depth: clampPositiveInteger(request.depth, 1, limits.maxDepth),
    size: clampPositiveInteger(request.size, 10, limits.maxNeighborsPerNode),
    scope: normalizeScope(request.scope, limits.allowedScopes),
  }
}

export function resolveGraphTraversalLimits(
  overrides: Partial<GraphTraversalLimits> | undefined,
): GraphTraversalLimits {
  const allowedScopes =
    overrides?.allowedScopes?.map((entry) => entry.trim()).filter(Boolean) ?? DEFAULT_GRAPH_LIMITS.allowedScopes
  return {
    maxDepth: clampPositiveInteger(overrides?.maxDepth, DEFAULT_GRAPH_LIMITS.maxDepth, 32),
    maxResultSize: clampPositiveInteger(overrides?.maxResultSize, DEFAULT_GRAPH_LIMITS.maxResultSize, 500),
    maxNeighborsPerNode: clampPositiveInteger(
      overrides?.maxNeighborsPerNode,
      DEFAULT_GRAPH_LIMITS.maxNeighborsPerNode,
      200,
    ),
    allowedScopes: allowedScopes.length > 0 ? allowedScopes : DEFAULT_GRAPH_LIMITS.allowedScopes,
  }
}

export function createGraphSearchStubAdapter(): GraphSearchAdapter {
  return {
    async search(request) {
      return {
        nodes: [],
        edges: [],
        meta: {
          tool: 'graph_search',
          limited: true,
          depth: request.depth,
          size: request.size,
          scope: request.scope,
        },
      }
    },
  }
}

export function createGraphNeighborsStubAdapter(): GraphNeighborsAdapter {
  return {
    async neighbors(request) {
      return {
        nodes: [],
        edges: [],
        meta: {
          tool: 'graph_neighbors',
          limited: true,
          depth: request.depth,
          size: request.size,
          scope: request.scope,
        },
      }
    },
  }
}
