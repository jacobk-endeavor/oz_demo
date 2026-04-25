import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../shared/api/client'
import type { GraphEdge, GraphNode, GraphResponse, LayerFilter } from './types'

interface UseGraphDataResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  loading: boolean
  error: string | null
  refetch: () => void
}

const cache = new Map<string, GraphResponse>()

function buildCacheKey(category: string, layers: LayerFilter[]): string {
  const sorted = [...layers].sort()
  return `${category}:${sorted.join(',')}`
}

function enrichNodes(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const counts = new Map<string, number>()
  for (const edge of edges) {
    const targetId = typeof edge.target === 'string' ? edge.target : edge.target
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1)
  }
  return nodes.map((n) => ({ ...n, citation_count: counts.get(n.id) ?? 0 }))
}

export function useGraphData(
  category: string,
  layers: LayerFilter[],
): UseGraphDataResult {
  const [data, setData] = useState<GraphResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(() => {
    const key = buildCacheKey(category, layers)
    const cached = cache.get(key)
    if (cached) {
      setData(cached)
      setLoading(false)
      setError(null)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (layers.length > 0) params.set('layers', layers.join(','))
    const query = params.toString()
    const path = `/api/graph${query ? `?${query}` : ''}`

    api
      .get<GraphResponse>(path)
      .then((resp) => {
        if (controller.signal.aborted) return
        cache.set(key, resp)
        setData(resp)
        setError(null)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Failed to fetch graph')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
  }, [category, layers])

  useEffect(() => {
    fetchData()
    return () => {
      abortRef.current?.abort()
    }
  }, [fetchData])

  const refetch = useCallback(() => {
    const key = buildCacheKey(category, layers)
    cache.delete(key)
    fetchData()
  }, [category, layers, fetchData])

  // CRITICAL: memoize derived arrays.  Without this, every re-render
  // (e.g. every hover-triggered setState in GraphPage) returns fresh
  // array references, GraphCanvas's graphData useMemo invalidates, and
  // react-force-graph-2d restarts the force simulation from scratch —
  // the "spazzing" symptom.  Keyed on `data` so the references stay
  // stable between fetches.
  const nodes = useMemo(
    () => (data ? enrichNodes(data.nodes, data.edges) : []),
    [data],
  )
  const edges = useMemo(() => data?.edges ?? [], [data])

  return { nodes, edges, loading, error, refetch }
}
