import { useCallback, useMemo, useState } from 'react'
import { GraphCanvas } from './GraphCanvas'
import { GraphTooltip } from './GraphTooltip'
import { useGraphData } from './useGraphData'
import type { GraphNode, LayerFilter } from './types'

// All layers, always.  The per-layer toggle chips were removed at the
// user's request — layer colour in the graph is sufficient visual
// differentiation and the toggle UI was clutter.
const ALL_LAYERS: LayerFilter[] = [1, 2, 3, 4]

function LoadingSkeleton() {
  return (
    <div className="flex flex-1 items-center justify-center" data-testid="graph-loading">
      <div className="flex flex-col items-center gap-3">
        <svg
          className="h-8 w-8 animate-spin text-blue-500"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="text-sm text-zinc-400">Loading graph...</span>
      </div>
    </div>
  )
}

export function GraphPage() {
  const [category, setCategory] = useState('')
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  // Stable reference so useGraphData's dep check doesn't refetch.
  const layers = useMemo(() => ALL_LAYERS, [])

  const { nodes, edges, loading, error } = useGraphData(category, layers)

  const handleHover = useCallback(
    (node: GraphNode | null, screenX?: number, screenY?: number) => {
      setHoveredNode(node)
      if (node && screenX !== undefined && screenY !== undefined) {
        setTooltipPos({ x: screenX, y: screenY })
      }
    },
    [],
  )

  const handleSelect = useCallback((node: GraphNode) => {
    setSelectedNode(node)
  }, [])

  const incomingCitations = selectedNode
    ? edges.filter((e) => {
        const target = typeof e.target === 'string' ? e.target : e.target
        return target === selectedNode.id
      })
    : []

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-zinc-100 pb-4">
        <h2 className="text-lg font-semibold text-zinc-900">Knowledge Graph</h2>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All categories</option>
          {[...new Set(nodes.map((n) => n.category))].sort().map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Main content */}
      <div className="relative flex flex-1 overflow-hidden pt-4">
        {error && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-red-500">Error: {error}</p>
          </div>
        )}

        {loading && !error && <LoadingSkeleton />}

        {!loading && !error && (
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            onHover={handleHover}
            onSelect={handleSelect}
            overlay={
              <GraphTooltip node={hoveredNode} x={tooltipPos.x} y={tooltipPos.y} />
            }
          />
        )}

        {/* Right-rail details pane */}
        <div className="w-80 flex-shrink-0 overflow-y-auto border-l border-zinc-100 pl-4">
          {selectedNode ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-600">
                  {selectedNode.id}
                </span>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                  L{selectedNode.layer}
                </span>
                <span className="text-xs text-zinc-400">{selectedNode.category}</span>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-zinc-800">
                {selectedNode.statement}
              </p>
              {incomingCitations.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Cited by
                  </h4>
                  <ul className="space-y-1">
                    {incomingCitations.map((edge, i) => {
                      const sourceId =
                        typeof edge.source === 'string' ? edge.source : edge.source
                      return (
                        <li
                          key={`${sourceId}-${i}`}
                          className="flex items-center gap-2 text-xs text-zinc-600"
                        >
                          <span className="font-mono">{sourceId}</span>
                          <span className="text-zinc-300">({edge.relation})</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-sm text-zinc-400">
                Hover a node to preview; click to pin.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
