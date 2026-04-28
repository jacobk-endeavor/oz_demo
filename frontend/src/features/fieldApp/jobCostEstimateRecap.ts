/**
 * Job Cost Estimate Recap — Excel-like demo quote schema.
 *
 * Mirrors the "Job Cost Recap" sheet of Q26-0601-LB (lumber framing package) used
 * for on-site field entry. Section titles and line items follow Field voice Script 4
 * (material buckets; design vs assembly labor at $68 / $61 kept as sheet defaults when the
 * Field voice script skips the labor Q&A; indirect, travel, shipping, commission, payment).
 *
 * Column letters used: A B C D E F G  (0-6).
 * Row numbers in this module are 1-indexed to match Excel — i.e. row 3 = "row 3".
 */

import { DEMO_REP_FIRST_NAME } from '../../config/demoRep'

export type JcrFieldType = 'text' | 'textarea' | 'date' | 'number' | 'currency'

export interface JcrInputField {
  id: string
  label: string
  type: JcrFieldType
  /** 1-indexed Excel row */
  row: number
  /** 0-indexed column (A=0, B=1, …) */
  col: number
  /** Where the row label sits ('A' col by default; some sections want B). 0-indexed col. */
  labelCol?: number
  /** When true, the label spans from labelCol .. col-1 inclusive. Default: just the labelCol cell. */
  labelSpan?: boolean
  required?: boolean
  helpText?: string
  defaultValue: string | number | null
}

export interface JcrComputedField {
  id: string
  label: string
  /** Pure function of current numeric values keyed by input id and other computed ids. */
  formula: (v: Record<string, number>) => number
  row: number
  col: number
  labelCol?: number
  labelSpan?: boolean
  format?: 'currency' | 'number' | 'percentage'
  /** Optional human readable formula string (shown on hover so the demo feels Excel-y). */
  formulaSrc?: string
}

export interface JcrSection {
  id: string
  title: string
  /** 1-indexed Excel row where the gray section header sits. */
  titleRow: number
  fields: JcrInputField[]
}

export type JcrFieldRef = { kind: 'input'; field: JcrInputField } | { kind: 'computed'; field: JcrComputedField }

/**
 * Voice-demo example: Summit Ridge Framing / lumber package (ref Q25-4420-LUM).
 * Row labels follow Field voice Script 4: material buckets; design / assembly labor hours stay
 * on the seeded sheet (not verbalized in the shortened voice flow); then additional costs
 * and payment (SCRIPT3_T5).
 *
 * Sanity check:
 *   material 38,500 + 62,000 + 0 = 100,500
 *   design 200h × 68 = 13,600 ; assembly 400h × 61 = 24,400 → labor 38,000 ; hrs 600
 *   prepaid 1.5% of 285,000 = 4,275
 *   total cost 100,500 + 38,000 + 6,500 + 4,200 + 4,275 + 2,800 = 156,275
 *   profit 285,000 − 156,275 = 128,725 → margin ~45.2%
 */
export const JCR_JSON_EXAMPLE_DEFAULTS = {
  date: '2026-04-26',
  project_number: 'Q26-0601-LB',
  ref_quote_numbers: 'Q25-4420-LUM',
  customer_name: 'Summit Ridge Framing',
  project_manager: 'James',
  customer_po_number: 'PO-SR-MARSHALL-0426',
  job_description:
    'Marshall Court multi-family wood-frame package for Summit Ridge Framing — SPF dimensional (2×6 / 2×10), LVL and I-joist floor system, 7/16 OSB wall and roof sheathing, anchor-bolt and hardware bundle. Flatbed delivery in three drops tied to crane picks; moisture coverage per quote.',
  order_value: 285_000,
  customer_supplied_equipment_value: 0,
  /** Voice T3 — dimensional lumber and studs */
  material_dimensional_studs: 38_500,
  /** Voice T3 — engineered lumber */
  material_engineered_lumber: 62_000,
  /** Voice T3 — treated or specialty stock */
  material_treated_specialty: 0,
  /** Design labor row — hours default on sheet (Script 4 voice no longer asks for this line). Rate $68. */
  design_labor_hours: 200,
  design_labor_rate: 68,
  /** Assembly labor row — same; rate $61. */
  assembly_labor_hours: 400,
  assembly_labor_rate: 61,
  indirect_labor_cost: 6_500,
  travel_expenses: 4_200,
  shipping_cost: 2_800,
  sales_commission_agent_name: '',
  sales_commission_amount: 0,
  first_progress_payment_trigger: '50% on lumber PO acceptance',
  first_progress_payment_amount: 142_500,
  final_payment_trigger: 'Net-30 after final delivery',
  final_payment_amount: 142_500,
} as const

/**
 * Kenny Hills demo defaults — same schema (three material buckets + two labor rows).
 */
export const KENNY_HILLS_JCR_DEFAULTS = {
  date: '2026-04-26',
  project_number: 'P26-0428-KH',
  ref_quote_numbers: 'Q26-0428-KH',
  customer_name: 'Kenny Hills Contracting',
  project_manager: DEMO_REP_FIRST_NAME,
  customer_po_number: 'PO-KH-2026-0428',
  job_description:
    'Capped composite deck package: lead deck line + Apex hidden fasteners (added day-after on prior order — closing same-trip this time) + color-matched fascia / riser bundle on long runs. Coastal pool surround, ¼″ drainage gap, ICC-ESR backed clip system.',
  order_value: 58_500,
  customer_supplied_equipment_value: 0,
  material_dimensional_studs: 0,
  material_engineered_lumber: 32_400,
  material_treated_specialty: 4_200,
  design_labor_hours: 6,
  design_labor_rate: 68,
  assembly_labor_hours: 24,
  assembly_labor_rate: 61,
  indirect_labor_cost: 1_200,
  travel_expenses: 850,
  shipping_cost: 620,
  sales_commission_agent_name: '',
  sales_commission_amount: 0,
  first_progress_payment_trigger: 'PO acceptance',
  first_progress_payment_amount: 29_250,
  final_payment_trigger: 'Net-30 after delivery',
  final_payment_amount: 29_250,
} as const

export const JCR_SECTIONS: readonly JcrSection[] = [
  {
    id: 'header_info',
    title: 'Project Information',
    titleRow: 2,
    fields: [
      { id: 'date', label: 'Date', type: 'date', row: 3, col: 1, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.date },
      { id: 'project_number', label: 'Project Number', type: 'text', row: 4, col: 1, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.project_number },
      { id: 'ref_quote_numbers', label: 'Ref Quote Number(s)', type: 'text', row: 5, col: 1, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.ref_quote_numbers },
      { id: 'customer_name', label: 'Customer Name', type: 'text', row: 6, col: 1, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.customer_name },
      { id: 'project_manager', label: 'Project Manager', type: 'text', row: 7, col: 1, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.project_manager },
      { id: 'customer_po_number', label: 'Customer P.O. Number', type: 'text', row: 8, col: 1, defaultValue: KENNY_HILLS_JCR_DEFAULTS.customer_po_number },
      { id: 'job_description', label: 'Job Description (voice: one-line description + cover total)', type: 'textarea', row: 9, col: 1, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.job_description },
    ],
  },
  {
    id: 'order_value',
    title: 'Order & customer equipment value',
    titleRow: 10,
    fields: [
      {
        id: 'order_value',
        label: 'Order value (amount to be invoiced)',
        type: 'currency',
        row: 11,
        col: 6,
        labelCol: 1,
        labelSpan: true,
        required: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.order_value,
      },
      {
        id: 'customer_supplied_equipment_value',
        label: 'Est. value of parts/equip. supplied by customer (insurance only)',
        type: 'currency',
        row: 13,
        col: 6,
        labelCol: 1,
        labelSpan: true,
        helpText: 'Listed only for insurance purposes. Estimate is fine.',
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.customer_supplied_equipment_value,
      },
    ],
  },
  {
    id: 'material_buckets',
    title: 'Material buckets (voice: dimensional & studs — engineered — treated / specialty)',
    titleRow: 14,
    fields: [
      {
        id: 'material_dimensional_studs',
        label: 'Dimensional lumber & studs',
        type: 'currency',
        row: 16,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        required: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.material_dimensional_studs,
      },
      {
        id: 'material_engineered_lumber',
        label: 'Engineered lumber',
        type: 'currency',
        row: 17,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        required: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.material_engineered_lumber,
      },
      {
        id: 'material_treated_specialty',
        label: 'Treated / specialty stock',
        type: 'currency',
        row: 18,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        required: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.material_treated_specialty,
      },
    ],
  },
  {
    id: 'design_labor',
    title: 'Design labor — takeoff, layout & lift plan (voice: $68/hr)',
    titleRow: 20,
    fields: [
      { id: 'design_labor_hours', label: 'Hours', type: 'number', row: 22, col: 1, labelCol: 0, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.design_labor_hours },
      { id: 'design_labor_rate', label: 'Rate ($/hr)', type: 'currency', row: 22, col: 2, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.design_labor_rate },
    ],
  },
  {
    id: 'assembly_labor',
    title: 'Assembly / yard labor — crew staging & delivery alignment (voice: $61/hr)',
    titleRow: 23,
    fields: [
      { id: 'assembly_labor_hours', label: 'Hours', type: 'number', row: 25, col: 1, labelCol: 0, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.assembly_labor_hours },
      { id: 'assembly_labor_rate', label: 'Rate ($/hr)', type: 'currency', row: 25, col: 2, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.assembly_labor_rate },
    ],
  },
  {
    id: 'additional_costs',
    title: 'Additional costs (voice: indirect, travel, shipping, commission, payment)',
    titleRow: 28,
    fields: [
      {
        id: 'indirect_labor_cost',
        label: 'Indirect labor (outside resources)',
        type: 'currency',
        row: 30,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.indirect_labor_cost,
      },
      {
        id: 'travel_expenses',
        label: 'Travel expenses',
        type: 'currency',
        row: 32,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.travel_expenses,
      },
      {
        id: 'shipping_cost',
        label: 'Shipping (to the customer)',
        type: 'currency',
        row: 36,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.shipping_cost,
      },
    ],
  },
  {
    id: 'sales_commission',
    title: 'Sales commission',
    titleRow: 37,
    fields: [
      { id: 'sales_commission_agent_name', label: 'Outside agent name', type: 'text', row: 38, col: 2, defaultValue: KENNY_HILLS_JCR_DEFAULTS.sales_commission_agent_name },
      {
        id: 'sales_commission_amount',
        label: 'Sales commission amount',
        type: 'currency',
        row: 38,
        col: 5,
        labelCol: 3,
        labelSpan: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.sales_commission_amount,
      },
    ],
  },
  {
    id: 'payment_schedule',
    title: 'Payment schedule',
    titleRow: 39,
    fields: [
      {
        id: 'first_progress_payment_trigger',
        label: '1st progress payment — trigger',
        type: 'text',
        row: 40,
        col: 1,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.first_progress_payment_trigger,
      },
      { id: 'first_progress_payment_amount', label: 'Amount', type: 'currency', row: 40, col: 4, defaultValue: KENNY_HILLS_JCR_DEFAULTS.first_progress_payment_amount },
      { id: 'final_payment_trigger', label: 'Final payment — trigger', type: 'text', row: 41, col: 1, defaultValue: KENNY_HILLS_JCR_DEFAULTS.final_payment_trigger },
      { id: 'final_payment_amount', label: 'Amount', type: 'currency', row: 41, col: 4, defaultValue: KENNY_HILLS_JCR_DEFAULTS.final_payment_amount },
    ],
  },
  {
    id: 'totals',
    title: 'Totals',
    titleRow: 42,
    fields: [],
  },
] as const

export const JCR_COMPUTED: readonly JcrComputedField[] = [
  {
    id: 'design_labor_line_total',
    label: 'Design labor $',
    formula: (v) => v.design_labor_hours * v.design_labor_rate,
    row: 22,
    col: 3,
    format: 'currency',
    formulaSrc: '=B22*C22',
  },
  {
    id: 'assembly_labor_line_total',
    label: 'Assembly labor $',
    formula: (v) => v.assembly_labor_hours * v.assembly_labor_rate,
    row: 25,
    col: 3,
    format: 'currency',
    formulaSrc: '=B25*C25',
  },
  {
    id: 'total_material_cost',
    label: 'Total material cost',
    formula: (v) => v.material_dimensional_studs + v.material_engineered_lumber + v.material_treated_specialty,
    row: 19,
    col: 6,
    labelCol: 1,
    labelSpan: true,
    format: 'currency',
    formulaSrc: '=SUM(F16:F18)',
  },
  {
    id: 'total_eng_asm_hrs',
    label: 'Total labor hours (design + assembly)',
    formula: (v) => v.design_labor_hours + v.assembly_labor_hours,
    row: 26,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'number',
    formulaSrc: '=B22+B25',
  },
  {
    id: 'total_eng_asm_cost',
    label: 'Total labor cost',
    formula: (v) => v.design_labor_line_total + v.assembly_labor_line_total,
    row: 27,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'currency',
    formulaSrc: '=D22+D25',
  },
  {
    id: 'prepaid_supplies',
    label: 'Prepaid supplies (1.5% of sales)',
    formula: (v) => v.order_value * 0.015,
    row: 34,
    col: 5,
    labelCol: 1,
    labelSpan: true,
    format: 'currency',
    formulaSrc: '=G11*0.015',
  },
  {
    id: 'total_cost',
    label: 'Total cost',
    formula: (v) =>
      v.total_material_cost +
      v.total_eng_asm_cost +
      v.indirect_labor_cost +
      v.travel_expenses +
      v.prepaid_supplies +
      v.shipping_cost +
      v.sales_commission_amount,
    row: 43,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'currency',
    formulaSrc: '=F19+G27+F30+F32+F34+F36+F38',
  },
  {
    id: 'profit',
    label: 'Profit',
    formula: (v) => v.order_value - v.total_cost,
    row: 45,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'currency',
    formulaSrc: '=G11-G43',
  },
  {
    id: 'profit_margin',
    label: 'Profit margin',
    formula: (v) => (v.order_value === 0 ? 0 : v.profit / v.order_value),
    row: 46,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'percentage',
    formulaSrc: '=G45/G11',
  },
] as const

/** All sheet rows are 1-indexed; this is the highest row used (for the renderer to size the grid). */
export const JCR_TOTAL_ROWS = 46
/** Column count: A..G */
export const JCR_TOTAL_COLS = 7
export const JCR_COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

/** Prefix marker for free-text cell overrides stored alongside field values. */
export const JCR_CELL_OVERRIDE_PREFIX = '__cell:'

export function jcrCellOverrideKey(row: number, col: number): string {
  return `${JCR_CELL_OVERRIDE_PREFIX}${row},${col}`
}

export function isJcrCellOverrideKey(key: string): boolean {
  return key.startsWith(JCR_CELL_OVERRIDE_PREFIX)
}

/** Returns input + computed numeric values for formula evaluation. */
export function evaluateJcr(values: Record<string, string | number>): Record<string, number> {
  const num = (id: string): number => {
    const v = values[id]
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(/[^0-9.-]/g, ''))
      return Number.isFinite(n) ? n : 0
    }
    return 0
  }
  const ctx: Record<string, number> = {}
  for (const section of JCR_SECTIONS) {
    for (const f of section.fields) {
      if (f.type === 'number' || f.type === 'currency') ctx[f.id] = num(f.id)
    }
  }
  // Computed fields are in dependency order in JCR_COMPUTED.
  for (const c of JCR_COMPUTED) ctx[c.id] = c.formula(ctx)
  return ctx
}

/**
 * Auto-generate a customer PO from a customer name. Used by `buildInitialJcrValues`
 * so the rep doesn't have to dictate a PO from scratch — the cell loads pre-filled
 * with a date-stamped slug, and the rep can edit later if the customer supplies
 * a real PO. Format: `PO-{slug}-{YYYYMMDD}-{rand4}`.
 */
export function autoGenerateCustomerPoNumber(customerName: string | null | undefined): string {
  const slug =
    (customerName ?? '')
      .toString()
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .map((t) => t[0]!.toUpperCase() + t.slice(1).toLowerCase())
      .join('')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 12) || 'CUSTOMER'
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `PO-${slug}-${ymd}-${rand}`
}

export function buildInitialJcrValues(
  overrides?: Partial<Record<string, string | number>>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const section of JCR_SECTIONS) {
    for (const f of section.fields) {
      out[f.id] = f.defaultValue == null ? (f.type === 'number' || f.type === 'currency' ? 0 : '') : f.defaultValue
    }
  }
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v != null) out[k] = v
    }
  }
  // Auto-generate the customer PO if it's still blank after defaults + overrides.
  // Saves the rep from having to dictate one cold; they can edit if the customer supplies a real PO.
  const po = out['customer_po_number']
  if (typeof po !== 'string' || po.trim() === '') {
    const customer = typeof out['customer_name'] === 'string' ? (out['customer_name'] as string) : ''
    out['customer_po_number'] = autoGenerateCustomerPoNumber(customer)
  }
  return out
}

export function formatJcrValue(value: number, format: 'currency' | 'number' | 'percentage' | undefined): string {
  if (format === 'percentage') return `${(value * 100).toFixed(1)}%`
  if (format === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export function jcrCellAddress(row: number, col: number): string {
  return `${JCR_COL_LETTERS[col] ?? '?'}${row}`
}
