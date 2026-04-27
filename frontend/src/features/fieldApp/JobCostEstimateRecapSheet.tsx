import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { joinClasses } from '../../shared/ui'
import {
  buildInitialJcrValues,
  evaluateJcr,
  formatJcrValue,
  jcrCellAddress,
  jcrCellOverrideKey,
  JCR_COL_LETTERS,
  JCR_COMPUTED,
  JCR_SECTIONS,
  JCR_TOTAL_COLS,
  JCR_TOTAL_ROWS,
  type JcrComputedField,
  type JcrInputField,
} from './jobCostEstimateRecap'

/** Keyed sparse map of cell content. */
type CellKey = string // `${row},${col}`

interface SectionTitleCell {
  kind: 'sectionTitle'
  title: string
  row: number
  startCol: number
  endCol: number
}
interface LabelCell {
  kind: 'label'
  text: string
  row: number
  startCol: number
  endCol: number
  helpText?: string
}
interface InputCell {
  kind: 'input'
  field: JcrInputField
}
interface ComputedCell {
  kind: 'computed'
  field: JcrComputedField
}

type CellContent = SectionTitleCell | LabelCell | InputCell | ComputedCell

const cellKey = (row: number, col: number): CellKey => `${row},${col}`

function buildCellMap(): Map<CellKey, CellContent> {
  const map = new Map<CellKey, CellContent>()
  for (const section of JCR_SECTIONS) {
    map.set(cellKey(section.titleRow, 0), {
      kind: 'sectionTitle',
      title: section.title,
      row: section.titleRow,
      startCol: 0,
      endCol: JCR_TOTAL_COLS - 1,
    })
    for (const f of section.fields) {
      const labelStart = f.labelCol ?? 0
      const labelEnd = f.labelSpan ? Math.max(labelStart, f.col - 1) : labelStart
      map.set(cellKey(f.row, labelStart), {
        kind: 'label',
        text: f.label,
        row: f.row,
        startCol: labelStart,
        endCol: labelEnd,
        helpText: f.helpText,
      })
      map.set(cellKey(f.row, f.col), { kind: 'input', field: f })
    }
  }
  for (const c of JCR_COMPUTED) {
    const labelStart = c.labelCol ?? 0
    const labelEnd = c.labelSpan ? Math.max(labelStart, c.col - 1) : labelStart
    if (!map.has(cellKey(c.row, labelStart))) {
      map.set(cellKey(c.row, labelStart), {
        kind: 'label',
        text: c.label,
        row: c.row,
        startCol: labelStart,
        endCol: labelEnd,
      })
    }
    map.set(cellKey(c.row, c.col), { kind: 'computed', field: c })
  }
  return map
}

interface SheetProps {
  initialOverrides?: Partial<Record<string, string | number>>
  onCreateInvoice?: (snapshot: { values: Record<string, string | number>; computed: Record<string, number> }) => void
  /** Fires (debounced) on each cell edit so a parent can persist values. */
  onValuesChange?: (values: Record<string, string | number>) => void
  /** Optional caption above the sheet (e.g. "Quote sheet for Kenny Hills"). */
  caption?: string
  /** Merged onto the root `<section>` (e.g. `min-h-0 flex-1` when embedded in a flex column). */
  className?: string
}

export function JobCostEstimateRecapSheet({
  initialOverrides,
  onCreateInvoice,
  onValuesChange,
  caption,
  className,
}: SheetProps) {
  const [values, setValues] = useState<Record<string, string | number>>(() =>
    buildInitialJcrValues(initialOverrides),
  )
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null)
  const cellMap = useMemo(buildCellMap, [])
  const computed = useMemo(() => evaluateJcr(values), [values])
  const sheetHeaderSubtitle = useMemo(() => {
    const p = values.project_number
    return typeof p === 'string' && p.trim() !== '' ? `${p.trim()} · Job Cost Recap` : 'Job Cost Recap'
  }, [values.project_number])
  const onValuesChangeRef = useRef(onValuesChange)
  onValuesChangeRef.current = onValuesChange

  // Debounce edits so we don't write to localStorage on every keystroke.
  useEffect(() => {
    if (!onValuesChangeRef.current) return
    const cb = onValuesChangeRef.current
    const t = window.setTimeout(() => cb(values), 250)
    return () => window.clearTimeout(t)
  }, [values])

  function setField(id: string, value: string | number) {
    setValues((v) => ({ ...v, [id]: value }))
  }

  function setCellOverride(row: number, col: number, text: string) {
    const key = jcrCellOverrideKey(row, col)
    setValues((v) => {
      if (text === '') {
        if (!(key in v)) return v
        const next = { ...v }
        delete next[key]
        return next
      }
      return { ...v, [key]: text }
    })
  }

  function getCellOverride(row: number, col: number): string | undefined {
    const v = values[jcrCellOverrideKey(row, col)]
    return typeof v === 'string' ? v : undefined
  }

  const activeContent = activeCell ? cellMap.get(cellKey(activeCell.row, activeCell.col)) ?? null : null
  const activeAddress = activeCell ? jcrCellAddress(activeCell.row, activeCell.col) : ''
  const activeFormula =
    activeContent?.kind === 'computed' ? activeContent.field.formulaSrc ?? '(computed)' : null
  const activeValuePreview =
    activeContent?.kind === 'computed'
      ? formatJcrValue(computed[activeContent.field.id] ?? 0, activeContent.field.format)
      : activeContent?.kind === 'input'
        ? String(values[activeContent.field.id] ?? '')
        : ''

  // Track which cells are part of a span (so we don't render a separate cell over them).
  const spannedCells = useMemo(() => {
    const set = new Set<CellKey>()
    for (const c of cellMap.values()) {
      if (c.kind === 'sectionTitle' || c.kind === 'label') {
        for (let cc = c.startCol + 1; cc <= c.endCol; cc += 1) set.add(cellKey(c.row, cc))
      }
    }
    return set
  }, [cellMap])

  const rows: number[] = []
  for (let r = 1; r <= JCR_TOTAL_ROWS; r += 1) rows.push(r)

  return (
    <section
      className={joinClasses(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-300/80 bg-white shadow-sm',
        className,
      )}
      data-testid="jcr-sheet"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-gradient-to-r from-emerald-50 to-white px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800">
            {sheetHeaderSubtitle}
          </p>
          <p className="text-sm font-semibold text-zinc-900">
            {caption ?? 'Job Cost Estimate Recap (editable demo)'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCreateInvoice?.({ values, computed })}
          className="inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          data-testid="jcr-create-invoice"
        >
          Create invoice from sheet →
        </button>
      </header>

      {/* Formula bar */}
      <div className="flex shrink-0 items-stretch gap-0 border-b border-zinc-200 bg-zinc-50/80 text-xs">
        <span
          className="flex w-14 shrink-0 items-center justify-center border-r border-zinc-300 bg-white font-mono font-semibold text-zinc-700"
          data-testid="jcr-name-box"
        >
          {activeAddress || '—'}
        </span>
        <span className="flex w-7 shrink-0 items-center justify-center border-r border-zinc-300 bg-white font-mono italic text-zinc-500">
          fx
        </span>
        <span className="flex min-w-0 flex-1 items-center truncate px-3 py-1.5 font-mono text-zinc-700">
          {activeFormula ?? activeValuePreview ?? ''}
        </span>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table
          className="w-full min-w-[44rem] border-collapse text-left font-sans text-[12.5px]"
          role="grid"
          aria-label="Job cost estimate recap sheet"
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-10 border border-zinc-300 bg-zinc-100 text-center font-semibold text-zinc-600"
                aria-label="Row header"
              />
              {JCR_COL_LETTERS.map((letter) => (
                <th
                  key={letter}
                  scope="col"
                  className="border border-zinc-300 bg-zinc-100 py-1 text-center font-semibold text-zinc-600"
                >
                  {letter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 w-10 border border-zinc-300 bg-zinc-100 text-center font-mono text-[11px] text-zinc-500"
                >
                  {row}
                </th>
                {JCR_COL_LETTERS.map((_letter, col) => {
                  const k = cellKey(row, col)
                  if (spannedCells.has(k)) return null
                  const content = cellMap.get(k)
                  return (
                    <SheetCell
                      key={col}
                      row={row}
                      col={col}
                      content={content ?? null}
                      isActive={activeCell?.row === row && activeCell?.col === col}
                      onActivate={() => setActiveCell({ row, col })}
                      values={values}
                      computed={computed}
                      setField={setField}
                      cellOverride={getCellOverride(row, col)}
                      setCellOverride={(text) => setCellOverride(row, col, text)}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

interface CellProps {
  row: number
  col: number
  content: CellContent | null
  isActive: boolean
  onActivate: () => void
  values: Record<string, string | number>
  computed: Record<string, number>
  setField: (id: string, value: string | number) => void
  cellOverride: string | undefined
  setCellOverride: (text: string) => void
}

function SheetCell({
  row,
  col,
  content,
  isActive,
  onActivate,
  values,
  computed,
  setField,
  cellOverride,
  setCellOverride,
}: CellProps) {
  const baseClass = joinClasses(
    'border border-zinc-200 align-middle',
    isActive ? 'outline outline-2 outline-emerald-500/80 outline-offset-[-2px]' : '',
  )

  if (!content) {
    // Empty cells are still editable — typed text becomes a free-text annotation.
    return (
      <td className={joinClasses(baseClass, 'h-7 bg-white p-0')} onClick={onActivate}>
        <input
          type="text"
          value={cellOverride ?? ''}
          onChange={(e) => setCellOverride(e.target.value)}
          onFocus={onActivate}
          className="block h-full w-full border-0 bg-transparent px-1.5 py-0.5 text-[12.5px] text-zinc-700 focus:outline-none focus:ring-0"
          aria-label={`Free cell ${jcrCellAddress(row, col)}`}
        />
      </td>
    )
  }

  if (content.kind === 'sectionTitle') {
    const span = content.endCol - content.startCol + 1
    return (
      <td
        colSpan={span}
        className={joinClasses(baseClass, 'bg-emerald-100/80 p-0')}
        onClick={onActivate}
      >
        <input
          type="text"
          value={cellOverride ?? content.title}
          onChange={(e) => setCellOverride(e.target.value === content.title ? '' : e.target.value)}
          onFocus={onActivate}
          className="block w-full border-0 bg-transparent px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-900 focus:outline-none focus:ring-0"
          aria-label={`Section title ${jcrCellAddress(row, col)}`}
        />
      </td>
    )
  }

  if (content.kind === 'label') {
    const span = content.endCol - content.startCol + 1
    return (
      <td
        colSpan={span}
        className={joinClasses(baseClass, 'bg-zinc-50/80 p-0')}
        title={content.helpText}
        onClick={onActivate}
      >
        <input
          type="text"
          value={cellOverride ?? content.text}
          onChange={(e) => setCellOverride(e.target.value === content.text ? '' : e.target.value)}
          onFocus={onActivate}
          className="block w-full border-0 bg-transparent px-2 py-1 text-[12.5px] text-zinc-700 focus:outline-none focus:ring-0"
          aria-label={`Label ${jcrCellAddress(row, col)}`}
        />
      </td>
    )
  }

  if (content.kind === 'computed') {
    const f = content.field
    const value = computed[f.id] ?? 0
    const formatted = formatJcrValue(value, f.format)
    const display = cellOverride ?? formatted
    const isOverridden = cellOverride != null
    return (
      <td
        className={joinClasses(
          baseClass,
          'p-0',
          isOverridden ? 'bg-amber-50/80' : 'bg-blue-50/70',
        )}
        title={f.formulaSrc ?? ''}
        onClick={onActivate}
      >
        <input
          type="text"
          value={display}
          onChange={(e) => setCellOverride(e.target.value === formatted ? '' : e.target.value)}
          onFocus={onActivate}
          className={joinClasses(
            'block w-full border-0 bg-transparent px-2 py-1 text-right font-mono tabular-nums focus:outline-none focus:ring-0',
            isOverridden ? 'text-amber-900' : 'text-blue-900',
          )}
          aria-label={`Computed cell ${jcrCellAddress(row, col)} (${f.label})`}
        />
      </td>
    )
  }

  // input
  const f = content.field
  const raw = values[f.id]
  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.value
    if (f.type === 'number' || f.type === 'currency') {
      const n = parseFloat(val.replace(/[^0-9.-]/g, ''))
      setField(f.id, Number.isFinite(n) ? n : 0)
    } else {
      setField(f.id, val)
    }
  }

  if (f.type === 'textarea') {
    return (
      <td
        className={joinClasses(baseClass, 'bg-white p-0 align-top')}
        onClick={onActivate}
      >
        <textarea
          value={String(raw ?? '')}
          onChange={onChange}
          onFocus={onActivate}
          rows={3}
          className="block h-full w-full resize-y border-0 bg-transparent px-2 py-1 text-[12.5px] text-zinc-900 focus:outline-none focus:ring-0"
          aria-label={f.label}
          data-testid={`jcr-input-${f.id}`}
        />
      </td>
    )
  }

  const isNumeric = f.type === 'number' || f.type === 'currency'
  const inputValue = isNumeric
    ? typeof raw === 'number'
      ? raw === 0 && f.required === false
        ? ''
        : String(raw)
      : String(raw ?? '')
    : String(raw ?? '')

  return (
    <td className={joinClasses(baseClass, 'bg-white p-0')} onClick={onActivate}>
      <input
        type={f.type === 'date' ? 'date' : 'text'}
        inputMode={isNumeric ? 'decimal' : undefined}
        value={inputValue}
        onChange={onChange}
        onFocus={onActivate}
        className={joinClasses(
          'block w-full border-0 bg-transparent px-2 py-1 text-[12.5px] text-zinc-900 focus:outline-none focus:ring-0',
          isNumeric ? 'text-right font-mono tabular-nums' : '',
        )}
        aria-label={`${f.label} (${jcrCellAddress(row, col)})`}
        data-testid={`jcr-input-${f.id}`}
      />
    </td>
  )
}
