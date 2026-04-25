import type { GraphNode } from './types'

interface GraphTooltipProps {
  node: GraphNode | null
  x: number
  y: number
}

const layerLabel: Record<number, string> = {
  1: 'L1',
  2: 'L2',
  3: 'L3',
  4: 'L4',
}

export function GraphTooltip({ node, x, y }: GraphTooltipProps) {
  if (!node) return null

  // Position the card so its bottom edge sits just above the hovered
  // dot.  translateX(-50%) centres it horizontally on the node; the
  // translateY(-100%) lifts it fully above.  The extra -10px is the gap
  // between the card and the node rim.
  return (
    <div
      data-testid="graph-tooltip"
      className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-zinc-200 bg-white p-3 shadow-lg"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, calc(-100% - 10px))',
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-600">
          {node.id}
        </span>
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
          {layerLabel[node.layer] ?? `L${node.layer}`}
        </span>
        <span className="text-xs text-zinc-400">{node.category}</span>
      </div>
      <p className="text-sm leading-snug text-zinc-800">{node.statement}</p>
    </div>
  )
}
