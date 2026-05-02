import { Fragment, createContext, useContext, type ReactNode } from 'react'
import {
  splitAssistantInlineLine,
  type ParsedGrammarNode,
} from '../../../../shared/oz/citationGrammarResolver'
import type { TableRowContextAttachment } from '../tableRowContext'
import { getOzPanelPayload } from '../../features/oz/useOzChatStream'
import {
  type AssistantMarkdownInlineRenderer,
  renderAssistantMarkdownInlineDefault,
} from './SimpleAssistantMarkdown'

/** Shell context: thread scope + which panel (if any) is open in the slide-out. */
export type OzChatPanelShellState = {
  threadId: string
  openPanel: { messageId: string; panelId: string; kind?: string } | null
  togglePanel: (messageId: string, panelId: string, kind?: string) => void
  closePanel: () => void
  /** Pin a `display_table` row into the Oz composer (sandbox/catalog/recs/calls chip scopes). */
  pinDisplayTableRow?: (attachment: TableRowContextAttachment) => void
}

export const OzChatPanelShellContext = createContext<OzChatPanelShellState | null>(null)

export const OzChatPanelMessageContext = createContext<{ messageId: string } | null>(null)

function panelLabel(kind?: string): string {
  if (!kind || kind === 'table') return 'Table panel'
  return kind.replace(/_/g, ' ')
}

export function PanelPill({ panelId, panelKind }: { panelId: string; panelKind?: string }) {
  const shell = useContext(OzChatPanelShellContext)
  const msgCtx = useContext(OzChatPanelMessageContext)
  if (!shell?.threadId || !msgCtx) {
    return (
      <span className="rounded bg-amber-100 px-1 font-mono text-[11px] text-amber-900" title="Panel unavailable">
        [panel]
      </span>
    )
  }

  const payload = getOzPanelPayload(shell.threadId, msgCtx.messageId)
  const result = payload?.result as Record<string, unknown> | undefined
  const resolvedId = typeof result?.panel_id === 'string' ? result.panel_id : ''
  const mismatch = resolvedId && resolvedId !== panelId
  const open =
    shell.openPanel?.panelId === panelId && shell.openPanel?.messageId === msgCtx.messageId
  const label = panelLabel(panelKind)

  return (
    <button
      type="button"
      title={mismatch ? 'Panel id does not match tool result for this message' : `Open ${label}`}
      aria-pressed={open}
      data-testid="oz-panel-pill"
      data-panel-id={panelId}
      className="mx-0.5 inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-violet-300/80 bg-violet-50 px-2 py-0.5 text-left align-baseline text-[11px] font-semibold text-violet-900 shadow-sm transition-colors hover:bg-violet-100"
      onClick={() => {
        if (mismatch) return
        shell.togglePanel(msgCtx.messageId, panelId, panelKind)
      }}
    >
      <span className="truncate">{open ? 'Close panel' : `Open ${label}`}</span>
      {mismatch ? (
        <span className="font-mono text-[10px] font-normal text-amber-800" title="Mismatched id">
          ⚠
        </span>
      ) : null}
    </button>
  )
}

function renderGrammarFallback(node: ParsedGrammarNode, keyBase: string, baseRender: AssistantMarkdownInlineRenderer) {
  return baseRender(node.raw, keyBase)
}

/**
 * Wraps the assistant inline renderer (e.g. Oz citation chips) and inserts {@link PanelPill}s for
 * `&lt;panel …/&gt;` tags while preserving citation splitting inside plain-text segments.
 */
export function createOzPanelAwareInlineRenderer(
  base: AssistantMarkdownInlineRenderer | undefined,
): AssistantMarkdownInlineRenderer {
  const baseRender = base ?? renderAssistantMarkdownInlineDefault
  return (line: string, keyBase: string): ReactNode => {
    const segments = splitAssistantInlineLine(line)
    if (segments.length === 1 && segments[0]?.type === 'text') {
      return baseRender(line, keyBase)
    }
    return (
      <>
        {segments.map((seg, i) =>
          seg.type === 'text' ? (
            <Fragment key={`${keyBase}-t-${i}`}>{baseRender(seg.text, `${keyBase}-t-${i}`)}</Fragment>
          ) : seg.node.kind === 'panel' ? (
            <PanelPill
              key={`${keyBase}-p-${i}`}
              panelId={seg.node.id}
              panelKind={seg.node.panelKind}
            />
          ) : (
            <Fragment key={`${keyBase}-g-${i}`}>
              {renderGrammarFallback(seg.node, `${keyBase}-g-${i}`, baseRender)}
            </Fragment>
          ),
        )}
      </>
    )
  }
}
