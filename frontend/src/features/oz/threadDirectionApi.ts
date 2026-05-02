/**
 * Browser client for GET/PUT `/api/oz/chat/thread/:id/direction`
 * (served by Vite Oz chat middleware when DATABASE_URL is present).
 */

import type {
  OzThreadDirectionPutInput,
  OzThreadDirectionRow,
} from '../../../../backend/oz/threadDirectionNormalize'

export type { OzThreadDirectionRow }

export function threadDirectionUrl(threadId: string): string {
  const enc = encodeURIComponent(threadId)
  return `/api/oz/chat/thread/${enc}/direction`
}

export async function fetchThreadDirection(threadId: string): Promise<OzThreadDirectionRow | null> {
  const res = await fetch(threadDirectionUrl(threadId), {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (res.status === 200) {
    const text = await res.text()
    if (text === 'null' || text.trim() === '') return null
    return JSON.parse(text) as OzThreadDirectionRow
  }
  if (res.status === 503) {
    throw new Error('Direction API unavailable (database not configured)')
  }
  const errText = await res.text().catch(() => '')
  throw new Error(`GET direction failed: HTTP ${res.status} ${errText.slice(0, 120)}`)
}

export async function putThreadDirection(
  threadId: string,
  body: OzThreadDirectionPutInput,
): Promise<OzThreadDirectionRow> {
  const res = await fetch(threadDirectionUrl(threadId), {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 200) {
    return (await res.json()) as OzThreadDirectionRow
  }
  if (res.status === 503) {
    throw new Error('Direction API unavailable (database not configured)')
  }
  const errText = await res.text().catch(() => '')
  throw new Error(`PUT direction failed: HTTP ${res.status} ${errText.slice(0, 120)}`)
}
