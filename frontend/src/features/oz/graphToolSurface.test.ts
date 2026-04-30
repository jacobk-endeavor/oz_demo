import { describe, expect, it, vi } from 'vitest'
import { createOzToolSurface } from '../../../../backend/oz/chatRuntime'

describe('createOzToolSurface', () => {
  it('enforces depth, size, and scope on graph_search', async () => {
    const search = vi.fn(async (request) => ({
      nodes: [],
      edges: [],
      meta: {
        tool: 'graph_search' as const,
        limited: true,
        depth: request.depth,
        size: request.size,
        scope: request.scope,
      },
    }))
    const neighbors = vi.fn(async () => ({
      nodes: [],
      edges: [],
      meta: {
        tool: 'graph_neighbors' as const,
        limited: true,
        depth: 1,
        size: 1,
        scope: 'default',
      },
    }))

    const surface = createOzToolSurface(
      { message: 'show me suppliers', ragScope: 'customer-graph' },
      {
        graph: {
          limits: {
            maxDepth: 2,
            maxResultSize: 25,
            maxNeighborsPerNode: 8,
            allowedScopes: ['customer-graph', 'ops-graph'],
          },
          searchAdapter: { search },
          neighborsAdapter: { neighbors },
        },
      },
    )

    const result = await surface.graph_search({
      query: 'show me supplier dependencies',
      depth: 9,
      size: 999,
      scope: 'not-allowed',
    })

    expect(search).toHaveBeenCalledWith({
      query: 'show me supplier dependencies',
      depth: 2,
      size: 25,
      scope: 'customer-graph',
    })
    expect(result.meta).toMatchObject({
      tool: 'graph_search',
      limited: true,
      depth: 2,
      size: 25,
      scope: 'customer-graph',
    })
  })

  it('uses request scope fallback and neighbor limits on graph_neighbors', async () => {
    const search = vi.fn(async () => ({
      nodes: [],
      edges: [],
      meta: {
        tool: 'graph_search' as const,
        limited: true,
        depth: 1,
        size: 1,
        scope: 'default',
      },
    }))
    const neighbors = vi.fn(async (request) => ({
      nodes: [],
      edges: [],
      meta: {
        tool: 'graph_neighbors' as const,
        limited: true,
        depth: request.depth,
        size: request.size,
        scope: request.scope,
      },
    }))

    const surface = createOzToolSurface(
      { message: 'neighbors of node', ragScope: 'ops-graph' },
      {
        graph: {
          limits: {
            maxDepth: 3,
            maxResultSize: 25,
            maxNeighborsPerNode: 5,
            allowedScopes: ['ops-graph'],
          },
          searchAdapter: { search },
          neighborsAdapter: { neighbors },
        },
      },
    )

    const result = await surface.graph_neighbors({
      nodeId: 'company:acme',
      depth: 7,
      size: 11,
    })

    expect(neighbors).toHaveBeenCalledWith({
      nodeId: 'company:acme',
      depth: 3,
      size: 5,
      scope: 'ops-graph',
    })
    expect(result.meta).toMatchObject({
      tool: 'graph_neighbors',
      limited: true,
      depth: 3,
      size: 5,
      scope: 'ops-graph',
    })
  })
})
