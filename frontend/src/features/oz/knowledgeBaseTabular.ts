/**
 * Best-effort parse of local file text into a small table for the Knowledge Base demo.
 * Caps row count for UI performance.
 */
export const KNOWLEDGE_BASE_MAX_ROWS = 800

export interface TabularResult {
  headers: string[]
  rows: string[][]
}

function capRows(r: TabularResult): TabularResult {
  if (r.rows.length <= KNOWLEDGE_BASE_MAX_ROWS) return r
  return {
    headers: r.headers,
    rows: r.rows.slice(0, KNOWLEDGE_BASE_MAX_ROWS),
  }
}

function linesAsTable(text: string, header: string): TabularResult {
  const lines = text.split(/\r?\n/)
  const rows: string[][] = []
  for (const line of lines) {
    if (line.length === 0) continue
    rows.push([line])
  }
  if (rows.length === 0) {
    return { headers: [header], rows: [['(empty)']] }
  }
  return { headers: [header], rows }
}

function parseCsvLine(line: string, delimiter: string): string[] {
  if (delimiter !== ',' && delimiter !== '\t') {
    return line.split(delimiter)
  }
  if (delimiter === '\t') {
    return line.split('\t').map((c) => c.trim())
  }
  // comma — support quoted fields
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQ = !inQ
    } else if (c === ',' && !inQ) {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur.replace(/^"|"$/g, '').trim())
  return out
}

function inferDelimiter(firstLine: string): string {
  const tabs = (firstLine.match(/\t/g) ?? []).length
  const commas = (firstLine.match(/,/g) ?? []).length
  if (tabs > 0 && tabs >= commas) return '\t'
  if (commas > 0) return ','
  if (tabs > 0) return '\t'
  return ','
}

function parseDelimited(text: string, fileHint: 'csv' | 'tsv' | 'auto'): TabularResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { headers: ['(empty)'], rows: [] }
  }
  const delim =
    fileHint === 'tsv' ? '\t' : fileHint === 'csv' ? inferDelimiter(lines[0]) : inferDelimiter(lines[0])
  const parsed = lines.map((line) => parseCsvLine(line, delim))
  const width = Math.max(1, ...parsed.map((r) => r.length))
  const pad = (r: string[]) => {
    const x = [...r]
    while (x.length < width) x.push('')
    return x
  }
  if (parsed.length === 1) {
    return {
      headers: parsed[0]!.map((_, i) => `Column ${i + 1}`),
      rows: [pad(parsed[0]!)],
    }
  }
  const headers = pad(parsed[0]!).map((c, i) => c || `Column ${i + 1}`)
  const rows = parsed.slice(1).map(pad)
  return { headers, rows }
}

function tableFromJson(data: unknown): TabularResult {
  if (data === null) {
    return { headers: ['Value'], rows: [['null']] }
  }
  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return { headers: ['Value'], rows: [[String(data)]] }
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return { headers: ['(empty array)'], rows: [] }
    }
    if (data.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x))) {
      const keys = new Set<string>()
      for (const o of data as object[]) {
        for (const k of Object.keys(o)) keys.add(k)
      }
      const headers = Array.from(keys).sort()
      if (headers.length === 0) {
        return { headers: ['(no keys)'], rows: data.map((_, i) => [`#${i}`]) }
      }
      const rows = (data as object[]).map((o) => headers.map((h) => {
        const v = (o as Record<string, unknown>)[h]
        if (v === null || v === undefined) return ''
        if (typeof v === 'object') return JSON.stringify(v)
        return String(v)
      }))
      return { headers, rows }
    }
    if (data.every((x) => Array.isArray(x))) {
      const width = Math.max(1, ...(data as unknown[][]).map((r) => r.length))
      const headers = Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
      const rows = (data as unknown[][]).map((r) => {
        const out = r.map((c) => (typeof c === 'object' && c !== null ? JSON.stringify(c) : String(c)))
        while (out.length < width) out.push('')
        return out
      })
      return { headers, rows }
    }
    // Array of primitives
    return { headers: ['#', 'Value'], rows: data.map((v, i) => [String(i + 1), String(v)]) }
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as object)
    return { headers: ['Key', 'Value'], rows: entries.map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)]) }
  }
  return { headers: ['Value'], rows: [[String(data)]] }
}

/**
 * @param name — file name (used for type hints)
 * @param text — UTF-8 text (may be lossy for binary)
 */
export function tabularFromText(name: string, text: string): TabularResult {
  const n = name.toLowerCase()
  const isProbablyBinary =
    text.length > 0 && /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text.slice(0, 4096))
  if (isProbablyBinary) {
    return {
      headers: ['Notice'],
      rows: [['This file looks binary. Export as CSV, JSON, or plain text to see a table.']],
    }
  }
  if (n.endsWith('.json') || n.endsWith('.jsonl')) {
    if (n.endsWith('.jsonl')) {
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
      const first = lines[0]
      if (!first) {
        return { headers: ['(empty)'], rows: [] }
      }
      try {
        const rowObjs = lines.map((line) => JSON.parse(line) as unknown)
        return tableFromJson(rowObjs)
      } catch {
        return { headers: ['Error'], rows: [['Each line in .jsonl should be one JSON value']] }
      }
    }
    try {
      const data = JSON.parse(text) as unknown
      return capRows(tableFromJson(data))
    } catch {
      return { headers: ['Error'], rows: [['Invalid JSON']] }
    }
  }
  if (n.endsWith('.tsv')) {
    return capRows(parseDelimited(text, 'tsv'))
  }
  if (n.endsWith('.csv')) {
    return capRows(parseDelimited(text, 'csv'))
  }
  // Heuristic: if many tabs or many commas, treat as delimited
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  if (firstLine.includes('\t') || (firstLine.includes(',') && firstLine.split(',').length > 2)) {
    return capRows(parseDelimited(text, 'auto'))
  }
  return capRows(linesAsTable(text, 'Line'))
}
