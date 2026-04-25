export interface GraphNode {
  id: string
  label: string
  statement: string
  layer: number
  category: string
  doc_slug: string | null
  citation_count?: number
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
}

export interface GraphEdge {
  source: string
  target: string
  relation: string
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
}

export type LayerFilter = 1 | 2 | 3 | 4
