/**
 * A row the user added from any generated data table to the Oz composer (e.g. `<Row 3>`).
 * `key` is globally unique; `rowId` is stable within that table/scope.
 */
export type TableContextScope = 'lead' | 'lumberyard' | 'competitor' | 'sandbox'

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

/** Maps `display_table` `scope` hint to composer chip scope (see docs §2.3). */
export function displayTableScopeToContextScope(tableScope: string | undefined): TableContextScope {
  const s = tableScope?.trim().toLowerCase() ?? ''
  if (s === 'sandbox') return 'sandbox'
  if (s === 'catalog') return 'lumberyard'
  if (s === 'recs') return 'lead'
  if (s === 'calls') return 'competitor'
  return 'lumberyard'
}

function summarizeCellsForContext(
  cells: Record<string, string | number | boolean | null | undefined>,
): string {
  return Object.entries(cells)
    .slice(0, 8)
    .map(([k, v]) => `${k}=${v === null || v === undefined ? '—' : String(v)}`)
    .join(' · ')
}

/** Pinned row from an Oz `display_table` slide-out (tool result payload). */
export function makeOzDisplayTableRowAttachment(input: {
  panelId: string
  tableScope: string | undefined
  row: { id: string; cells: Record<string, string | number | boolean | null | undefined> }
  displayIndex: number
}): TableRowContextAttachment {
  const scope = displayTableScopeToContextScope(input.tableScope)
  const key = `oz:tbl:${input.panelId}:${input.row.id}`
  return {
    key,
    scope,
    rowId: input.row.id,
    displayIndex: input.displayIndex,
    label: `<Row ${input.displayIndex}>`,
    modelLine: `(id \`${input.row.id}\`): ${summarizeCellsForContext(input.row.cells)}`,
  }
}
