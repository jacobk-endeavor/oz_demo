import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'

function mockJsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('api client demo fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns live API responses when they are available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ nodes: [] })))

    await expect(api.get('/api/graph')).resolves.toEqual({ nodes: [] })
  })

  it('falls back to seeded graph data when an API route returns non-json content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
      } as unknown as Response),
    )

    const graph = await api.get<{ nodes: { id: string }[] }>('/api/graph')

    expect(graph.nodes.map((node) => node.id)).toContain('obs_field_notes_001')
  })

  it('falls back to seeded chat sessions when the API route is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue(null),
      } as unknown as Response),
    )

    const payload = await api.get<{ sessions: { session_id: string }[] }>(
      '/api/chat/sessions',
    )

    expect(payload.sessions[0]?.session_id).toBe('demo-session-001')
  })
})
