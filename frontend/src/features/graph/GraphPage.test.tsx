import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { GraphPage } from './GraphPage'
import type { GraphNode, GraphEdge } from './types'

const fixtureNodes: GraphNode[] = [
  {
    id: 'obs_001',
    label: 'obs_001',
    statement: 'Revenue grew 12% YoY in Q3',
    layer: 4,
    category: 'finance',
    doc_slug: 'q3_report',
    citation_count: 2,
  },
  {
    id: 'conc_001',
    label: 'conc_001',
    statement: 'Company is on a strong growth trajectory',
    layer: 2,
    category: 'finance',
    doc_slug: null,
    citation_count: 0,
  },
  {
    id: 'conc_002',
    label: 'conc_002',
    statement: 'Q3 shows positive trend versus prior quarters',
    layer: 3,
    category: 'finance',
    doc_slug: null,
    citation_count: 1,
  },
]

const fixtureEdges: GraphEdge[] = [
  { source: 'conc_001', target: 'obs_001', relation: 'cites' },
  { source: 'conc_001', target: 'conc_002', relation: 'refines' },
  { source: 'conc_002', target: 'obs_001', relation: 'cites' },
]

vi.mock('./useGraphData', () => ({
  useGraphData: () => ({
    nodes: fixtureNodes,
    edges: fixtureEdges,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('react-force-graph-2d', () => ({
  default: function MockForceGraph2D(props: {
    onNodeHover?: (node: object | null, prev: object | null, event?: MouseEvent) => void
    onNodeClick?: (node: object) => void
  }) {
    return (
      <div data-testid="mock-force-graph">
        {fixtureNodes.map((node) => (
          <button
            key={node.id}
            data-testid={`node-${node.id}`}
            onMouseEnter={() =>
              props.onNodeHover?.(node, null, { clientX: 100, clientY: 200 } as MouseEvent)
            }
            onMouseLeave={() => props.onNodeHover?.(null, node)}
            onClick={() => props.onNodeClick?.(node)}
          >
            {node.id}
          </button>
        ))}
      </div>
    )
  },
}))

afterEach(() => {
  cleanup()
})

describe('GraphPage', () => {
  it('renders the knowledge graph header and category selector', () => {
    render(<GraphPage />)
    expect(screen.getByText('Knowledge Graph')).toBeTruthy()
    expect(screen.getByDisplayValue('All categories')).toBeTruthy()
  })

  it('shows hint text in the right rail before any selection', () => {
    render(<GraphPage />)
    expect(screen.getByText('Hover a node to preview; click to pin.')).toBeTruthy()
  })

  it('renders GraphTooltip with fixture statement on node hover', () => {
    render(<GraphPage />)

    const nodeBtn = screen.getByTestId('node-obs_001')
    fireEvent.mouseEnter(nodeBtn)

    const tooltip = screen.getByTestId('graph-tooltip')
    expect(tooltip).toBeTruthy()
    expect(tooltip.textContent).toContain('Revenue grew 12% YoY in Q3')
    expect(tooltip.textContent).toContain('obs_001')
    expect(tooltip.textContent).toContain('L4')
    expect(tooltip.textContent).toContain('finance')
  })

  it('hides GraphTooltip on mouse leave', () => {
    render(<GraphPage />)

    const nodeBtn = screen.getByTestId('node-obs_001')
    fireEvent.mouseEnter(nodeBtn)
    expect(screen.getByTestId('graph-tooltip')).toBeTruthy()

    fireEvent.mouseLeave(nodeBtn)
    expect(screen.queryByTestId('graph-tooltip')).toBeNull()
  })

  it('shows node details in right rail on click', () => {
    render(<GraphPage />)

    const nodeBtn = screen.getByTestId('node-obs_001')
    fireEvent.click(nodeBtn)

    expect(screen.getByText('Revenue grew 12% YoY in Q3')).toBeTruthy()
    expect(screen.getByText('Cited by')).toBeTruthy()
  })

  it('shows category selector', () => {
    render(<GraphPage />)
    const select = screen.getByDisplayValue('All categories')
    expect(select).toBeTruthy()
  })
})
