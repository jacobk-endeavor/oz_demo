import { Fragment, type ReactNode } from 'react'
import { isTableRow, isTableSep } from './assistantMarkdownTable'

const headingClass: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'text-lg font-bold tracking-tight text-zinc-900',
  2: 'text-base font-bold tracking-tight text-zinc-900',
  3: 'text-[15px] font-semibold text-zinc-900',
  4: 'text-[14px] font-semibold text-zinc-800',
  5: 'text-[13.5px] font-semibold text-zinc-800',
  6: 'text-[13px] font-semibold text-zinc-800',
}

function renderLinksAndItalic(s: string, keyBase: string): ReactNode {
  const out: ReactNode[] = []
  const re = /\[([^\]]*)\]\(([^)]+)\)/g
  let i = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s)) !== null) {
    if (m.index > i) {
      out.push(
        <Fragment key={`t-${keyBase}-${k++}`}>
          {renderItalicsInPlain(s.slice(i, m.index), `${keyBase}-p`)}
        </Fragment>,
      )
    }
    out.push(
      <a
        key={`a-${keyBase}-${k++}`}
        className="font-medium text-sky-700 underline decoration-sky-500/30 underline-offset-2 hover:decoration-sky-500/60"
        href={m[2]}
        target="_blank"
        rel="noreferrer noopener"
      >
        {m[1]}
      </a>,
    )
    i = m.index + m[0].length
  }
  if (i < s.length) {
    out.push(
      <Fragment key={`t-${keyBase}-end`}>{renderItalicsInPlain(s.slice(i), `${keyBase}-e`)}</Fragment>,
    )
  }
  return out.length ? <>{out}</> : renderItalicsInPlain(s, keyBase)
}

function renderItalicsInPlain(s: string, keyBase: string): ReactNode {
  const parts: ReactNode[] = []
  const re = /(?<!\*)\*([^*]+)\*(?!\*)/g
  let i = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s)) !== null) {
    if (m.index > i) {
      parts.push(
        <Fragment key={`x-${k++}`}>
          {renderBoldInPlain(s.slice(i, m.index), `${keyBase}-b`)}
        </Fragment>,
      )
    }
    parts.push(
      <em key={`i-${k++}`} className="text-zinc-800 italic">
        {renderBoldInPlain(m[1] ?? '', `${keyBase}-e`)}
      </em>,
    )
    i = m.index + m[0].length
  }
  if (i < s.length) {
    parts.push(
      <Fragment key={`x-${k++}`}>
        {renderBoldInPlain(s.slice(i), `${keyBase}-tail`)}
      </Fragment>,
    )
  }
  return parts.length ? <>{parts}</> : renderBoldInPlain(s, keyBase)
}

function renderBoldInPlain(s: string, keyBase: string): ReactNode {
  const parts: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*/g
  let i = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(s)) !== null) {
    if (m.index > i) parts.push(s.slice(i, m.index))
    parts.push(
      <strong key={`k-${keyBase}-${k++}`} className="font-semibold text-zinc-900">
        {m[1]}
      </strong>,
    )
    i = m.index + m[0].length
  }
  if (i < s.length) parts.push(s.slice(i))
  return parts.length ? <>{parts}</> : s
}

function renderInline(s: string, keyBase = 'i'): ReactNode {
  if (!s) return null
  return renderLinksAndItalic(s, keyBase)
}

type Block =
  | { type: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[]; start: number }
  | { type: 'table'; rows: string[][] }
  | { type: 'hr' }

function isHrLine(line: string): boolean {
  const t = line.trim()
  return t === '---' || t === '***' || t === '___' || t === '—'
}

function isUlItem(line: string): boolean {
  return /^\s*[-*]\s+/.test(line)
}

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const raw = lines[i]!
    const line = raw
    if (!line.trim()) {
      i += 1
      continue
    }
    if (isHrLine(line)) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }
    const hMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim())
    if (hMatch) {
      const level = hMatch[1]!.length as 1 | 2 | 3 | 4 | 5 | 6
      if (level >= 1 && level <= 6) {
        blocks.push({ type: 'h', level, text: hMatch[2] ?? '' })
        i += 1
        continue
      }
    }
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
    const mOl = /^\s*(\d+)\.\s+(.+)$/.exec(line)
    if (mOl) {
      const start = Number.parseInt(mOl[1] ?? '1', 10) || 1
      const items: string[] = [mOl[2] ?? '']
      i += 1
      while (i < lines.length) {
        const L = lines[i]!
        if (!L.trim()) break
        const c = /^\s*\d+\.\s+(.+)$/.exec(L)
        if (c) {
          items.push(c[1] ?? '')
          i += 1
        } else {
          break
        }
      }
      blocks.push({ type: 'ol', items, start })
      continue
    }
    if (isUlItem(line)) {
      const m2 = /^\s*[-*]\s+(.+)$/.exec(line)
      const items: string[] = [m2 ? (m2[1] ?? '') : line.replace(/^\s*[-*]\s+/, '')]
      i += 1
      while (i < lines.length) {
        const L = lines[i]!
        if (!L.trim()) break
        const c = /^\s*[-*]\s+(.+)$/.exec(L)
        if (c) {
          items.push(c[1] ?? '')
          i += 1
        } else {
          break
        }
      }
      blocks.push({ type: 'ul', items })
      continue
    }
    const para: string[] = [line]
    i += 1
    while (i < lines.length && lines[i]!.trim() && !isTableRow(lines[i]!) && !isHrLine(lines[i]!) && !/^(#{1,6})\s+/.test(lines[i]!.trim()) && !/^\s*\d+\.\s+/.test(lines[i]!) && !isUlItem(lines[i]!)) {
      para.push(lines[i]!)
      i += 1
    }
    blocks.push({ type: 'p', text: para.join('\n') })
  }
  return blocks
}

const HTag = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

/**
 * CommonMark-ish markdown for assistant replies: **bold**, *italic*, [links](), GFM-style pipe tables, headings, lists, hr.
 */
export function SimpleAssistantMarkdown({
  text,
  streamMode = false,
}: {
  text: string
  /** When true, tables render in full; typing cadence is handled by the parent stream. */
  streamMode?: boolean
}) {
  const blocks = parseBlocks(text)
  return (
    <div
      className="min-w-0 space-y-3 text-left"
      data-stream={streamMode ? '1' : undefined}
    >
      {blocks.map((b, bi) => {
        if (b.type === 'h') {
          const H = HTag[b.level - 1]!
          return (
            <H
              key={bi}
              className={`min-w-0 [overflow-wrap:anywhere] break-words text-left first:mt-0 ${headingClass[b.level]}`}
            >
              {renderInline(b.text, `h-${bi}`)}
            </H>
          )
        }
        if (b.type === 'p') {
          return (
            <p
              key={bi}
              className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-zinc-800 [overflow-wrap:anywhere]"
            >
              {b.text.split('\n').map((ln, li) => (
                <Fragment key={li}>
                  {li > 0 ? <br /> : null}
                  {renderInline(ln, `p-${bi}-${li}`)}
                </Fragment>
              ))}
            </p>
          )
        }
        if (b.type === 'ul') {
          return (
            <ul
              key={bi}
              className="list-outside list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-zinc-800 [overflow-wrap:anywhere] marker:text-zinc-500"
            >
              {b.items.map((it, ii) => (
                <li key={ii} className="pl-0.5">
                  {renderInline(it, `u-${bi}-${ii}`)}
                </li>
              ))}
            </ul>
          )
        }
        if (b.type === 'ol') {
          return (
            <ol
              key={bi}
              className="list-outside list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-zinc-800 [overflow-wrap:anywhere] marker:font-medium marker:text-zinc-500"
              start={b.start}
            >
              {b.items.map((it, ii) => (
                <li key={ii} className="pl-0.5">
                  {renderInline(it, `o-${bi}-${ii}`)}
                </li>
              ))}
            </ol>
          )
        }
        if (b.type === 'hr') {
          return <hr key={bi} className="my-1 border-0 border-t border-zinc-200/80" />
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
                        {renderInline(cell, `c-${bi}-${ri}-${ci}`)}
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
