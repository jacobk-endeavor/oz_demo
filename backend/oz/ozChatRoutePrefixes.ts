/**
 * User-facing route overrides (Track C). Spec: docs/wiki-kb/track-c-chat-integration.md (Tool selection guidance).
 * Stripping happens before the LLM; a fixed system note biases tool choice without a separate classifier.
 */

export type OzChatRoutePrefixKind = 'none' | 'vector' | 'wiki' | 'catalog' | 'calls'

export type ParsedOzChatRoutePrefix = {
  kind: OzChatRoutePrefixKind
  /** Message text with the leading slash-command removed (may be empty). */
  bareMessage: string
  /** When kind !== 'none', append this alongside the system prompt for the agent turn. */
  systemNote: string | null
}

const NOTES: Record<Exclude<OzChatRoutePrefixKind, 'none'>, string> = {
  vector:
    '[Route override /vector] The user asked to prioritize vector retrieval. Start with kb_search using their question (documents + optional call scope as needed). Use wiki_lookup or catalog tools only after kb_search unless the question clearly needs structured rows or wiki synthesis.',
  wiki:
    '[Route override /wiki] The user asked to prioritize the markdown wiki. Start with wiki_lookup; follow with wiki_read, wiki_grep, or wiki_log as needed. Prefer catalog_* only when the question names a SKU, product line code, or needs numeric aggregates.',
  catalog:
    '[Route override /catalog] The user asked to prioritize structured catalog data. Start with catalog_get, catalog_list, catalog_search, catalog_aggregate, catalog_compare, catalog_diff, or catalog_neighbors as appropriate before kb_search. Use recommendations_* when the question is about cross-sell, upsell, or substitutions.',
  calls:
    '[Route override /calls] The user asked to prioritize sales-call evidence. Start with kb_search with surface="call" (and/or search_transcripts for transcript lookup). Prefer kb_search(call scope) for chunked call RAG; use read_transcript when you have a specific call_id.',
}

/**
 * Parse leading `/vector`, `/wiki`, `/catalog`, or `/calls` (case-insensitive). Returns stripped text and a system note for the agent.
 */
export function parseOzChatRoutePrefix(rawMessage: string): ParsedOzChatRoutePrefix {
  const trimmed = rawMessage.trim()
  const m = trimmed.match(/^\s*\/(vector|wiki|catalog|calls)\b\s*(.*)$/i)
  if (!m) {
    return { kind: 'none', bareMessage: trimmed, systemNote: null }
  }
  const kindLower = m[1].toLowerCase() as Exclude<OzChatRoutePrefixKind, 'none'>
  const kind: OzChatRoutePrefixKind = kindLower
  const rest = (m[2] ?? '').trim()
  return {
    kind,
    bareMessage: rest,
    systemNote: NOTES[kindLower],
  }
}
