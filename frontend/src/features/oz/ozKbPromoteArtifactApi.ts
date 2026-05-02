/**
 * Frontend client for the P4-1 endpoint: stages an existing chat artifact's bytes from DO Spaces
 * and runs them through the standard KB ingest pipeline. Reuses the same Vite middleware as
 * `kbIngestApiPlugin` (registered ahead of the multipart `/ingest` handler).
 */
import type { ArtifactKbPromotionResult } from '../../shared/ui/ArtifactPill'

const PATH = '/api/oz/knowledge-base/promote-artifact'

/**
 * POST {artifact_id} → returns the standard KB-ingest response shape (source_id, wiki, pgvector,
 * kb_extracts_local) plus the chat-artifact provenance fields. Maps any non-200 to an error
 * result so callers (`ArtifactPill`) can render a retry affordance instead of throwing.
 */
export async function promoteArtifactToKb(
  artifactId: string,
  options?: { fetchImpl?: typeof fetch; signal?: AbortSignal },
): Promise<ArtifactKbPromotionResult> {
  const fetchImpl = options?.fetchImpl ?? fetch
  let res: Response
  try {
    res = await fetchImpl(PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifact_id: artifactId }),
      ...(options?.signal ? { signal: options.signal } : {}),
    })
  } catch (e) {
    return {
      ok: false,
      error: 'network_error',
      detail: e instanceof Error ? e.message : String(e),
    }
  }
  let body: Record<string, unknown> = {}
  try {
    body = (await res.json()) as Record<string, unknown>
  } catch {
    /* non-JSON body — leave as empty object so we can still surface status */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: typeof body.error === 'string' ? body.error : `http_${res.status}`,
      detail: typeof body.detail === 'string' ? body.detail : undefined,
    }
  }
  return {
    ok: true,
    source_id: typeof body.source_id === 'string' ? body.source_id : undefined,
  }
}
