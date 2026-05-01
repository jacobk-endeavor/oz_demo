const DEFAULT_CHUNK_SIZE = 1400
const DEFAULT_CHUNK_OVERLAP = 200

export type CharWindowChunkerOptions = {
  chunkSize?: number
  chunkOverlap?: number
}

export function chunkTextByCharWindow(
  text: string,
  options: CharWindowChunkerOptions = {},
): string[] {
  const normalized = text.trim()
  if (normalized.length === 0) return []

  const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_CHUNK_SIZE)
  const requestedOverlap = Math.max(0, options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP)
  const chunkOverlap = requestedOverlap >= chunkSize ? Math.floor(chunkSize / 5) : requestedOverlap

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length)
    chunks.push(normalized.slice(start, end))
    if (end >= normalized.length) break
    start = end - chunkOverlap
  }
  return chunks
}
