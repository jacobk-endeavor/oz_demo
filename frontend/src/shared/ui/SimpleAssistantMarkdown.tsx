import { Fragment, type ReactNode } from 'react'

function renderInline(s: string): ReactNode[] {
  const parts: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    parts.push(
      <strong key={`b-${k++}`} className="font-semibold text-zinc-900">
        {m[1]}
      </strong>,
    )
    last = m.index + m[0].length
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts.length ? parts : [s]
}

function isTableRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.includes('|', 1) && t.length > 2
}

function isTableSep(line: string): boolean {
  const t = line.trim()
  return /^\|[\s\-:|]+\|$/.test(t) || /^\|?[\s\-:|]+\|[\s\-|:]+$/.test(t)
}

type Block =
  | { type: 'p'; text: string }
  | { type: 'table'; rows: string[][] }

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (isTableRow(line)) {
      const tableLines: string[] = [line]
      i += 1
      if (i < lines.length && isTableSep(lines[i]!)) {
        tableLines.push(lines[i]!)
        i += 1
      }
      while (i < lines.length && isTableRow(lines[i]!)) {
        tableLines.push(lines[i]!)
        i += 1
      }
      const rows = tableLines
        .filter((l) => !isTableSep(l))
        .map((l) =>
          l
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => c.trim()),
        )
      if (rows.length) blocks.push({ type: 'table', rows })
      continue
    }
    if (!line.trim()) {
      i += 1
      continue
    }
    const para: string[] = [line]
    i += 1
    while (i < lines.length && lines[i]!.trim() && !isTableRow(lines[i]!)) {
      para.push(lines[i]!)
      i += 1
    }
    blocks.push({ type: 'p', text: para.join('\n') })
  }
  return blocks
}

/**
 * Subset of markdown for assistant replies: **bold**, GFM-style pipe tables, paragraphs.
 */
export function SimpleAssistantMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text)
  return (
    <div className="min-w-0 space-y-3 text-left">
      {blocks.map((b, bi) => {
        if (b.type === 'p') {
          return (
            <p key={bi} className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-zinc-800">
              {b.text.split('\n').map((line, li) => (
                <Fragment key={li}>
                  {li > 0 ? <br /> : null}
                  {renderInline(line)}
                </Fragment>
              ))}
            </p>
          )
        }
        return (
          <div key={bi} className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[280px] border-collapse text-left text-xs text-zinc-800">
              <tbody>
                {b.rows.map((row, ri) => (
                  <tr key={ri} className={ri === 0 ? 'bg-zinc-100/80 font-semibold' : 'bg-zinc-50/40'}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="border border-zinc-200 px-2 py-1.5 align-top [overflow-wrap:anywhere] break-words"
                      >
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
