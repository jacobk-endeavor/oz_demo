/**
 * Mirrors frontend augmentUserMessageWithTableContext so agentic runtimes can prepend
 * pinned row context without importing React-era frontend modules.
 */
export type TableContextAttachmentLike = {
  label?: string
  modelLine?: string
  scope?: string
}

export function augmentOzChatUserTextFromContext(
  bareMessage: string,
  context: unknown,
  scopesAllow?: readonly string[],
): string {
  const text = bareMessage
  const raw = context as Record<string, unknown> | undefined
  const attachments = raw?.tableContextAttachments
  if (!Array.isArray(attachments) || attachments.length === 0) return text

  const allow = scopesAllow?.length
    ? new Set(scopesAllow.map((s) => s.trim().toLowerCase()).filter(Boolean))
    : null

  const lines: string[] = []
  for (const a of attachments) {
    if (!a || typeof a !== 'object') continue
    const att = a as TableContextAttachmentLike
    const scope = typeof att.scope === 'string' ? att.scope.trim().toLowerCase() : ''
    if (allow && scope && !allow.has(scope)) continue
    const label = typeof att.label === 'string' ? att.label.trim() : ''
    const modelLine = typeof att.modelLine === 'string' ? att.modelLine.trim() : ''
    if (!label && !modelLine) continue
    lines.push(`- ${[label, modelLine].filter(Boolean).join(' ')}`.trim())
  }

  if (!lines.length) return text

  return [
    'The user added these table rows to the chat context. Prefer them when relevant; cite the row / id when useful.',
    '',
    lines.join('\n'),
    '',
    '**User question:**',
    text,
  ].join('\n')
}
