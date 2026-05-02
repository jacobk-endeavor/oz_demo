import { describe, expect, it, vi } from 'vitest'
import { promoteArtifactToKb } from './ozKbPromoteArtifactApi'

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('promoteArtifactToKb', () => {
  it('POSTs to /api/oz/knowledge-base/promote-artifact with the artifact_id and returns ok+source_id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ ok: true, source_id: 'src_abc123', artifact_id: 'art_1' }),
    )
    const result = await promoteArtifactToKb('art_1', { fetchImpl })
    expect(result).toEqual({ ok: true, source_id: 'src_abc123' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/oz/knowledge-base/promote-artifact')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(init.body).toBe(JSON.stringify({ artifact_id: 'art_1' }))
  })

  it('maps non-2xx responses to a structured error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ok: false, error: 'kind_not_promotable' }, { status: 415 }),
      )
    const result = await promoteArtifactToKb('art_2', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('kind_not_promotable')
  })

  it('surfaces network errors as { ok:false, error:"network_error" }', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'))
    const result = await promoteArtifactToKb('art_3', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('network_error')
    expect(result.detail).toBe('boom')
  })

  it('falls back to http_<status> when the body has no error field', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 503 }))
    const result = await promoteArtifactToKb('art_4', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('http_503')
  })
})
