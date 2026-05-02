import { Fragment, type ReactNode } from 'react'
import {
  parseOzCitationToken,
  resolveCitation,
  type CitationLookupTables,
} from '../../../../shared/oz/citationGrammarResolver'
import {
  citationClickDetail,
  citationHoverTitle,
  splitLineAtOzCitations,
  type OzCitationClickDetail,
} from './citationUi'
import {
  type AssistantMarkdownInlineRenderer,
  renderAssistantMarkdownInlineDefault,
} from '../../shared/ui/SimpleAssistantMarkdown'

function imagePreviewUrl(record: Record<string, unknown> | undefined): string | undefined {
  if (record == null) return undefined
  for (const k of ['thumb_url', 'url', 'public_url', 'src']) {
    const v = record[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return undefined
}

function OzCitationChip({
  raw,
  tables,
  onCitationClick,
  keyId,
}: {
  raw: string
  tables: CitationLookupTables | undefined
  onCitationClick?: (d: OzCitationClickDetail) => void
  keyId: string
}) {
  const parsed = parseOzCitationToken(raw)
  const resolved = parsed != null ? resolveCitation(parsed, tables ?? {}) : null
  const title = citationHoverTitle(parsed, resolved)
  const detail = citationClickDetail(parsed, resolved)
  const thumb =
    parsed?.kind === 'image' && resolved?.ok ? imagePreviewUrl(resolved.record) : undefined

  const onActivate = () => {
    if (detail == null) return
    onCitationClick?.(detail)
    window.dispatchEvent(
      new CustomEvent<OzCitationClickDetail>('oz-citation-click', { detail, bubbles: true }),
    )
  }

  return (
    <span className="group relative inline align-baseline" data-oz-citation-wrap={keyId}>
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={onActivate}
        className="oz-cite oz-cite-inline mx-0.5 cursor-help rounded px-0.5 font-mono text-[12px] font-medium text-sky-800 underline decoration-dotted decoration-sky-400/70 underline-offset-2 hover:bg-sky-50 hover:decoration-sky-600"
        data-oz-cite-kind={parsed?.kind ?? 'unknown'}
      >
        {raw}
      </button>
      {thumb ? (
        <span
          className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 rounded border border-zinc-200 bg-white p-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100"
          aria-hidden
        >
          <img src={thumb} alt="" className="max-h-32 max-w-[200px] object-contain" loading="lazy" />
        </span>
      ) : null}
    </span>
  )
}

/**
 * Builds an inline renderer that splits Oz citation tokens into interactive chips (hover title, click payload)
 * while delegating other prose to the default assistant markdown inline pass.
 */
export function createOzCitationInlineRenderer(
  tables: CitationLookupTables | undefined,
  options?: { onCitationClick?: (d: OzCitationClickDetail) => void },
): AssistantMarkdownInlineRenderer {
  return (line: string, keyBase: string): ReactNode => {
    const segments = splitLineAtOzCitations(line)
    if (segments.every((s) => s.type === 'text')) {
      return renderAssistantMarkdownInlineDefault(line, keyBase)
    }
    return (
      <>
        {segments.map((seg, i) =>
          seg.type === 'text' ? (
            <Fragment key={`${keyBase}-t-${i}`}>
              {renderAssistantMarkdownInlineDefault(seg.text, `${keyBase}-t-${i}`)}
            </Fragment>
          ) : (
            <OzCitationChip
              key={`${keyBase}-c-${i}`}
              raw={seg.raw}
              tables={tables}
              onCitationClick={options?.onCitationClick}
              keyId={`${keyBase}-${i}`}
            />
          ),
        )}
      </>
    )
  }
}
