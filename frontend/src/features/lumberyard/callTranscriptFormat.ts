const HEADER_LINE = /^#\s*([^:\n]+):\s*(.*)$/
const TURN_LINE = /^(.+?)\s+\[(rep|customer)\]:\s*(.*)$/i

export type CallTranscriptHeaderRow = { key: string; value: string }
export type CallTranscriptTurn = { speaker: string; role: 'rep' | 'customer'; text: string }

export type ParsedCallTranscript =
  | { mode: 'structured'; header: CallTranscriptHeaderRow[]; turns: CallTranscriptTurn[]; remainder: string }
  | { mode: 'raw'; raw: string }

/**
 * Parses Russin-style phone transcripts: leading `# Key: value` lines, then
 * `Name [rep|customer]: …` turns. Unknown shapes fall back to a single raw block.
 */
export function parseLumberyardCallTranscript(text: string): ParsedCallTranscript {
  const full = text.replace(/\r\n/g, '\n')
  const lines = full.split('\n')
  const header: CallTranscriptHeaderRow[] = []
  let i = 0
  while (i < lines.length) {
    const m = lines[i]!.match(HEADER_LINE)
    if (!m) break
    header.push({ key: m[1]!.trim(), value: m[2]!.trim() })
    i += 1
  }
  while (i < lines.length && lines[i]!.trim() === '') i += 1
  const bodyLines = lines.slice(i)
  const turns: CallTranscriptTurn[] = []
  const nonTurn: string[] = []
  for (const line of bodyLines) {
    if (line.trim() === '') {
      if (turns.length > 0 || nonTurn.length > 0) nonTurn.push(line)
      continue
    }
    const tm = line.match(TURN_LINE)
    if (tm) {
      const role = tm[2]!.toLowerCase() as 'rep' | 'customer'
      turns.push({
        speaker: tm[1]!.trim(),
        role,
        text: (tm[3] ?? '').trim(),
      })
    } else {
      nonTurn.push(line)
    }
  }
  const remainder = nonTurn.join('\n').trim()
  const canStructure = header.length > 0 || turns.length > 0
  if (!canStructure) {
    return { mode: 'raw', raw: full.trim() }
  }
  return { mode: 'structured', header, turns, remainder }
}
