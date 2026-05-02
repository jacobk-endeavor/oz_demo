import type { ResolvedCitation } from '../../../../shared/oz/citationGrammarResolver'
import { STALE_OR_INVALID_PANEL_ID } from '../../../../shared/oz/citationGrammarResolver'
import { joinClasses } from './visualSystem'

function readPanelPayload(record: Record<string, unknown>): unknown {
  if ('payload' in record && record.payload !== undefined) return record.payload
  return record
}

function panelKindFrom(citation: ResolvedCitation['citation'], record: Record<string, unknown>): string {
  if (citation.kind !== 'panel') return 'table'
  const fromRecord =
    typeof record.kind === 'string'
      ? record.kind
      : typeof (record as { panel_kind?: string }).panel_kind === 'string'
        ? (record as { panel_kind: string }).panel_kind
        : undefined
  return fromRecord ?? citation.panelKind ?? 'table'
}

export type PanelPillProps = {
  resolved: ResolvedCitation
  onOpen: (detail: { panelKind: string; payload: unknown; title?: string }) => void
}

/**
 * Inline affordance for `<panel …/>` — opens the shared {@link SlideOutPanel} via `onOpen`.
 */
export function PanelPill({ resolved, onOpen }: PanelPillProps) {
  if (resolved.citation.kind !== 'panel') return null

  if (!resolved.ok && resolved.reason === 'invalid_panel_id') {
    return (
      <span
        className="mx-0.5 inline rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[12px] font-medium text-amber-900"
        title={STALE_OR_INVALID_PANEL_ID}
      >
        {STALE_OR_INVALID_PANEL_ID}
      </span>
    )
  }

  if (!resolved.ok) return null

  const { record, citation } = resolved
  const panelKind = panelKindFrom(citation, record)
  const payload = readPanelPayload(record)
  const title =
    typeof record.title === 'string'
      ? record.title
      : typeof (record as { label?: string }).label === 'string'
        ? (record as { label: string }).label
        : undefined

  return (
    <button
      type="button"
      data-testid="oz-panel-pill"
      className={joinClasses(
        'mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-left text-[12px] font-medium text-violet-950',
        'shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-100/80',
      )}
      onClick={() => onOpen({ panelKind, payload, title })}
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-violet-600 text-[10px] font-bold text-white">
        ▸
      </span>
      <span className="min-w-0 truncate">
        Open <span className="font-semibold">{panelKind.replace(/_/g, ' ')}</span> panel
      </span>
    </button>
  )
}
