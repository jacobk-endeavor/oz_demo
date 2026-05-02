import { Fragment, type ReactNode } from 'react'
import {
  resolveCitation,
  splitOzAssistantInlineLine,
  type CitationLookupTables,
} from '../../../../shared/oz/citationGrammarResolver'
import { type OzCitationClickDetail } from './citationUi'
import {
  type AssistantMarkdownInlineRenderer,
  renderAssistantMarkdownInlineDefault,
} from '../../shared/ui/SimpleAssistantMarkdown'
import { ArtifactPill } from '../../shared/ui/ArtifactPill'
import { PanelPill } from '../../shared/ui/PanelPill'
import { OzCitationChip } from './OzCitationChip'

export type OzSlidePanelOpenDetail = { panelKind: string; payload: unknown; title?: string }

/**
 * Builds an inline renderer that splits Oz citation tokens and `<artifact/>` / `<panel/>` tags into
 * interactive chips and pills while delegating other prose to the default assistant markdown pass.
 */
export function createOzCitationInlineRenderer(
  tables: CitationLookupTables | undefined,
  options?: {
    onCitationClick?: (d: OzCitationClickDetail) => void
    /** When set, valid `<panel/>` pills invoke this so the host can mount {@link SlideOutPanel}. */
    onOpenSlidePanel?: (d: OzSlidePanelOpenDetail) => void
  },
): AssistantMarkdownInlineRenderer {
  return (line: string, keyBase: string): ReactNode => {
    const segments = splitOzAssistantInlineLine(line)
    if (segments.length === 1 && segments[0]!.type === 'text') {
      return renderAssistantMarkdownInlineDefault(segments[0]!.text, keyBase)
    }

    return (
      <>
        {segments.map((seg, i) => {
          if (seg.type === 'text') {
            return (
              <Fragment key={`${keyBase}-txt-${i}`}>
                {renderAssistantMarkdownInlineDefault(seg.text, `${keyBase}-txt-${i}`)}
              </Fragment>
            )
          }
          if (seg.type === 'cite') {
            return (
              <OzCitationChip
                key={`${keyBase}-c-${i}`}
                raw={seg.raw}
                tables={tables}
                onCitationClick={options?.onCitationClick}
                keyId={`${keyBase}-${i}`}
              />
            )
          }
          const resolved = resolveCitation(seg.node, tables ?? {})
          if (seg.node.kind === 'artifact') {
            return <ArtifactPill key={`${keyBase}-art-${i}`} resolved={resolved} />
          }
          if (seg.node.kind === 'panel') {
            return (
              <PanelPill
                key={`${keyBase}-pan-${i}`}
                resolved={resolved}
                onOpen={(d) => options?.onOpenSlidePanel?.(d)}
              />
            )
          }
          return null
        })}
      </>
    )
  }
}
