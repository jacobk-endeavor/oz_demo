import { memo, useCallback, useMemo, useRef, type ReactNode } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { GraphEdge, GraphNode } from './types'

interface GraphCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onHover: (node: GraphNode | null, screenX?: number, screenY?: number) => void
  onSelect: (node: GraphNode) => void
  /** Overlay children (e.g. tooltip) rendered inside the canvas's
      relative container so absolute-positioned overlays share the
      same coordinate origin as graph2ScreenCoords output. */
  overlay?: ReactNode
}

interface ForceGraphRef {
  centerAt: (x: number, y: number, ms: number) => void
  graph2ScreenCoords: (x: number, y: number) => { x: number; y: number }
}

const LAYER_COLOR: Record<number, string> = {
  1: '#1e40af', // blue-800
  2: '#2563eb', // blue-600
  3: '#60a5fa', // blue-400
  4: '#a1a1aa', // zinc-400
}

const RING_COLOR = '#18181b' // zinc-900

// Module-level constants so they keep the same reference identity
// across renders.  Passing fresh lambdas to ForceGraph2D props triggers
// unnecessary redraws (and in some versions, simulation restarts).
const MODE_REPLACE = () => 'replace' as const
const LINK_COLOR = () => '#d4d4d8'

function nodeColor(node: GraphNode): string {
  return LAYER_COLOR[node.layer] ?? '#a1a1aa'
}

function nodeRadius(node: GraphNode): number {
  const count = node.citation_count ?? 0
  return 3 + Math.sqrt(count) * 2
}

// -----------------------------------------------------------------------
// Inner memoised ForceGraph2D wrapper
// -----------------------------------------------------------------------
// Everything that talks to ForceGraph2D lives in this inner component.
// React.memo gates re-renders: as long as its props (nodes, edges, the
// two callbacks) are reference-stable, the canvas never re-renders —
// not even when the outer GraphCanvas re-renders because the overlay
// (tooltip) prop changes on every hover.
// -----------------------------------------------------------------------

interface InnerProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onHover: GraphCanvasProps['onHover']
  onSelect: GraphCanvasProps['onSelect']
}

const ForceGraphInner = memo(function ForceGraphInner({
  nodes,
  edges,
  onHover,
  onSelect,
}: InnerProps) {
  const graphRef = useRef<ForceGraphRef | null>(null)

  const graphData = useMemo(
    () => ({
      nodes: nodes as object[],
      links: edges.map((e) => ({ source: e.source, target: e.target, relation: e.relation })),
    }),
    [nodes, edges],
  )

  const handleNodeHover = useCallback(
    (node: object | null) => {
      if (!node) {
        onHover(null)
        return
      }
      const n = node as GraphNode & { x?: number; y?: number }
      if (n.x !== undefined && n.y !== undefined && graphRef.current) {
        const screen = graphRef.current.graph2ScreenCoords(n.x, n.y)
        onHover(n, screen.x, screen.y)
      } else {
        onHover(n)
      }
    },
    [onHover],
  )

  const handleNodeClick = useCallback(
    (node: object) => {
      onSelect(node as GraphNode)
    },
    [onSelect],
  )

  const paintNode = useCallback(
    (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x: number; y: number }
      const r = nodeRadius(n)
      const scaledR = r / globalScale
      ctx.beginPath()
      ctx.arc(n.x, n.y, scaledR + 0.5 / globalScale, 0, 2 * Math.PI)
      ctx.fillStyle = RING_COLOR
      ctx.fill()
      ctx.beginPath()
      ctx.arc(n.x, n.y, scaledR, 0, 2 * Math.PI)
      ctx.fillStyle = nodeColor(n)
      ctx.fill()
    },
    [],
  )

  const pointerAreaPaint = useCallback(
    (node: object, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode & { x: number; y: number }
      const r = nodeRadius(n) / globalScale + 2 / globalScale
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
    },
    [],
  )

  return (
    <ForceGraph2D
      ref={graphRef as never}
      graphData={graphData}
      nodeId="id"
      nodeCanvasObject={paintNode}
      nodeCanvasObjectMode={MODE_REPLACE}
      nodePointerAreaPaint={pointerAreaPaint}
      linkColor={LINK_COLOR}
      linkWidth={0.5}
      linkDirectionalArrowLength={3}
      linkDirectionalArrowRelPos={1}
      onNodeHover={handleNodeHover as never}
      onNodeClick={handleNodeClick as never}
      enablePanInteraction
      enableZoomInteraction
      backgroundColor="#ffffff"
      cooldownTime={2000}
      warmupTicks={80}
    />
  )
})

// -----------------------------------------------------------------------
// Outer wrapper: static ForceGraph + overlay slot for dynamic children
// -----------------------------------------------------------------------

export function GraphCanvas({ nodes, edges, onHover, onSelect, overlay }: GraphCanvasProps) {
  return (
    <div className="relative flex-1" data-testid="graph-canvas">
      <ForceGraphInner
        nodes={nodes}
        edges={edges}
        onHover={onHover}
        onSelect={onSelect}
      />
      {overlay}
    </div>
  )
}
