/**
 * A row the user added from any generated data table to the Oz composer (e.g. `<Row 3>`).
 * `key` is globally unique; `rowId` is stable within that table/scope.
 */
export type TableContextScope = 'lead' | 'lumberyard' | 'competitor'

export type TableRowContextAttachment = {
  key: string
  scope: TableContextScope
  rowId: string
  displayIndex: number
  label: string
  /** Trailing line for the model (after the label), without leading “-”. */
  modelLine: string
}

export function augmentUserMessageWithTableContext(
  text: string,
  attachments: TableRowContextAttachment[] | undefined,
  options?: { scopes?: TableContextScope[] },
): string {
  if (!attachments?.length) return text
  const scopes = options?.scopes
  const list = scopes?.length
    ? attachments.filter((a) => scopes.includes(a.scope))
    : attachments
  if (!list.length) return text
  const block = list
    .map((a) => `- ${a.label} ${a.modelLine}`)
    .join('\n')
  return `The user added these table rows to the chat context. Prefer them when relevant; cite the row / id when useful.\n\n${block}\n\n**User question:**\n${text}`
}
