export function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.includes('|', 1) && t.length > 2
}

export function isTableSep(line: string): boolean {
  const t = line.trim()
  return /^\|[\s\-:|]+\|$/.test(t) || /^\|?[\s\-:|]+\|[\s\-|:]+$/.test(t)
}
