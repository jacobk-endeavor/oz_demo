/**
 * Job Cost Estimate Recap — Excel-like demo quote schema.
 *
 * Mirrors the "Job Cost Recap" sheet of Q26-0002-04 (TSP RC Cell Build) used
 * for on-site field entry. The Field App voice flow renders this as an
 * editable, formula-live grid in place of the old PDF/spinner so the rep can
 * walk through each section like an Excel sheet and hand off to invoicing.
 *
 * Column letters used: A B C D E F G  (0-6).
 * Row numbers in this module are 1-indexed to match Excel — i.e. row 3 = "row 3".
 */

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
 * JSON-template example: Crown / TSP RC Cell Build (Q25-1102), the literal
 * "Job Cost Recap" demo embedded in the form schema spec. The schema's own
 * defaults are sparse (most are null) — this set fills in realistic numbers
 * for every field so the sheet loads as a fully-populated, formula-balanced
 * quote and works as a "render an actual quote from this JSON" demo.
 *
 * Sanity check (matches what the live formulas should compute):
 *   mech design  120h × $68 = 8,160 ; elec design  80h × $68 = 5,440  → design  13,600
 *   mech asm     240h × $61 =14,640 ; elec asm    160h × $61 = 9,760  → asm     24,400
 *   eng/asm hrs  600 ; eng/asm cost 38,000 ; material 100,500
 *   prepaid 1.5% of 285,000 = 4,275
 *   total cost   100,500 + 38,000 + 6,500 + 4,200 + 4,275 + 2,800 = 156,275
 *   profit       285,000 − 156,275 = 128,725  → margin ~45.2%
 */
export const JCR_JSON_EXAMPLE_DEFAULTS = {
  date: '2026-04-26',
  project_number: 'Q26-0002-04',
  ref_quote_numbers: 'Q25-1102',
  customer_name: 'Crown',
  project_manager: 'James',
  customer_po_number: 'PO-CRN-26-0002',
  job_description:
    'TSP RC Cell Build — robotic cell with conveyor integration, programmable PLC controls, safety guarding, vision pick verification, and on-site commissioning at Crown’s plant. Includes FAT, training package, and 90-day post-install support.',
  order_value: 285_000,
  customer_supplied_equipment_value: 0,
  electrical_components: 38_500,
  commercial_mechanical_components: 62_000,
  manufactured_mechanical_components: 0,
  mechanical_design_hrs: 120,
  mechanical_design_rate: 68,
  electrical_design_hrs: 80,
  electrical_design_rate: 68,
  mechanical_asm_hrs: 240,
  mechanical_asm_rate: 61,
  electrical_asm_hrs: 160,
  electrical_asm_rate: 61,
  indirect_labor_cost: 6_500,
  travel_expenses: 4_200,
  shipping_cost: 2_800,
  sales_commission_agent_name: '',
  sales_commission_amount: 0,
  first_progress_payment_trigger: '50% on PO acceptance',
  first_progress_payment_amount: 142_500,
  final_payment_trigger: 'Net-30 after FAT acceptance',
  final_payment_amount: 142_500,
} as const

/**
 * Kenny Hills demo defaults: based on the Field voice walkthrough — capped
 * composite line, Apex hidden fasteners, color-matched fascia, deck drainage —
 * with sensible mock pricing so the sheet adds up to a believable margin.
 */
export const KENNY_HILLS_JCR_DEFAULTS = {
  date: '2026-04-26',
  project_number: 'P26-0428-KH',
  ref_quote_numbers: 'Q26-0428-KH',
  customer_name: 'Kenny Hills Contracting',
  project_manager: 'Sami',
  customer_po_number: 'PO-KH-2026-0428',
  job_description:
    'Capped composite deck package: lead deck line + Apex hidden fasteners (added day-after on prior order — closing same-trip this time) + color-matched fascia / riser bundle on long runs. Coastal pool surround, ¼″ drainage gap, ICC-ESR backed clip system.',
  order_value: 58_500,
  customer_supplied_equipment_value: 0,
  electrical_components: 0,
  commercial_mechanical_components: 32_400,
  manufactured_mechanical_components: 4_200,
  mechanical_design_hrs: 6,
  mechanical_design_rate: 68,
  electrical_design_hrs: 0,
  electrical_design_rate: 68,
  mechanical_asm_hrs: 24,
  mechanical_asm_rate: 61,
  electrical_asm_hrs: 0,
  electrical_asm_rate: 61,
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
      { id: 'job_description', label: 'Job Description', type: 'textarea', row: 9, col: 1, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.job_description },
    ],
  },
  {
    id: 'order_value',
    title: 'Order & Customer Equipment Value',
    titleRow: 10,
    fields: [
      {
        id: 'order_value',
        label: 'Order Value (amount to be invoiced to customer)',
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
    id: 'component_cost',
    title: 'Component Cost',
    titleRow: 15,
    fields: [
      {
        id: 'electrical_components',
        label: 'Electrical Components',
        type: 'currency',
        row: 16,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        required: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.electrical_components,
      },
      {
        id: 'commercial_mechanical_components',
        label: 'Commercial Mechanical Components',
        type: 'currency',
        row: 17,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        required: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.commercial_mechanical_components,
      },
      {
        id: 'manufactured_mechanical_components',
        label: 'Manufactured Mechanical Components',
        type: 'currency',
        row: 18,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        required: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.manufactured_mechanical_components,
      },
    ],
  },
  {
    id: 'labor_cost_design',
    title: 'Design Labor Cost',
    titleRow: 20,
    fields: [
      { id: 'mechanical_design_hrs', label: 'Mechanical Design — Hours', type: 'number', row: 22, col: 1, labelCol: 0, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.mechanical_design_hrs },
      { id: 'mechanical_design_rate', label: 'Rate ($/hr)', type: 'currency', row: 22, col: 2, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.mechanical_design_rate },
      { id: 'electrical_design_hrs', label: 'Electrical Design — Hours', type: 'number', row: 23, col: 1, labelCol: 0, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.electrical_design_hrs },
      { id: 'electrical_design_rate', label: 'Rate ($/hr)', type: 'currency', row: 23, col: 2, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.electrical_design_rate },
    ],
  },
  {
    id: 'labor_cost_assembly',
    title: 'Assembly Labor Cost',
    titleRow: 25,
    fields: [
      { id: 'mechanical_asm_hrs', label: 'Mechanical Assembly — Hours', type: 'number', row: 27, col: 1, labelCol: 0, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.mechanical_asm_hrs },
      { id: 'mechanical_asm_rate', label: 'Rate ($/hr)', type: 'currency', row: 27, col: 2, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.mechanical_asm_rate },
      { id: 'electrical_asm_hrs', label: 'Electrical Assembly — Hours', type: 'number', row: 28, col: 1, labelCol: 0, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.electrical_asm_hrs },
      { id: 'electrical_asm_rate', label: 'Rate ($/hr)', type: 'currency', row: 28, col: 2, required: true, defaultValue: KENNY_HILLS_JCR_DEFAULTS.electrical_asm_rate },
    ],
  },
  {
    id: 'additional_costs',
    title: 'Additional Costs',
    titleRow: 29,
    fields: [
      {
        id: 'indirect_labor_cost',
        label: 'Indirect Labor Cost (outside resources)',
        type: 'currency',
        row: 30,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.indirect_labor_cost,
      },
      {
        id: 'travel_expenses',
        label: 'Travel Expenses',
        type: 'currency',
        row: 32,
        col: 5,
        labelCol: 1,
        labelSpan: true,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.travel_expenses,
      },
      {
        id: 'shipping_cost',
        label: 'Shipping Cost (to the customer)',
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
    title: 'Sales Commission',
    titleRow: 37,
    fields: [
      { id: 'sales_commission_agent_name', label: 'Outside Agent Name', type: 'text', row: 38, col: 2, defaultValue: KENNY_HILLS_JCR_DEFAULTS.sales_commission_agent_name },
      {
        id: 'sales_commission_amount',
        label: 'Sales Commission Amount',
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
    title: 'Payment Schedule',
    titleRow: 41,
    fields: [
      {
        id: 'first_progress_payment_trigger',
        label: '1st Progress Payment — Trigger',
        type: 'text',
        row: 39,
        col: 1,
        defaultValue: KENNY_HILLS_JCR_DEFAULTS.first_progress_payment_trigger,
      },
      { id: 'first_progress_payment_amount', label: 'Amount', type: 'currency', row: 39, col: 4, defaultValue: KENNY_HILLS_JCR_DEFAULTS.first_progress_payment_amount },
      { id: 'final_payment_trigger', label: 'Final Payment — Trigger', type: 'text', row: 40, col: 1, defaultValue: KENNY_HILLS_JCR_DEFAULTS.final_payment_trigger },
      { id: 'final_payment_amount', label: 'Amount', type: 'currency', row: 40, col: 4, defaultValue: KENNY_HILLS_JCR_DEFAULTS.final_payment_amount },
    ],
  },
] as const

export const JCR_COMPUTED: readonly JcrComputedField[] = [
  {
    id: 'mechanical_design_total',
    label: 'Mech Design Total',
    formula: (v) => v.mechanical_design_hrs * v.mechanical_design_rate,
    row: 22,
    col: 3,
    format: 'currency',
    formulaSrc: '=B22*C22',
  },
  {
    id: 'electrical_design_total',
    label: 'Elec Design Total',
    formula: (v) => v.electrical_design_hrs * v.electrical_design_rate,
    row: 23,
    col: 3,
    format: 'currency',
    formulaSrc: '=B23*C23',
  },
  {
    id: 'design_labor_subtotal',
    label: 'Design Labor Subtotal',
    formula: (v) => v.mechanical_design_total + v.electrical_design_total,
    row: 21,
    col: 5,
    labelCol: 4,
    format: 'currency',
    formulaSrc: '=SUM(D22:D23)',
  },
  {
    id: 'mechanical_asm_total',
    label: 'Mech Asm Total',
    formula: (v) => v.mechanical_asm_hrs * v.mechanical_asm_rate,
    row: 27,
    col: 3,
    format: 'currency',
    formulaSrc: '=B27*C27',
  },
  {
    id: 'electrical_asm_total',
    label: 'Elec Asm Total',
    formula: (v) => v.electrical_asm_hrs * v.electrical_asm_rate,
    row: 28,
    col: 3,
    format: 'currency',
    formulaSrc: '=B28*C28',
  },
  {
    id: 'assembly_labor_subtotal',
    label: 'Assembly Labor Subtotal',
    formula: (v) => v.mechanical_asm_total + v.electrical_asm_total,
    row: 26,
    col: 5,
    labelCol: 4,
    format: 'currency',
    formulaSrc: '=SUM(D27:D28)',
  },
  {
    id: 'total_eng_asm_hrs',
    label: 'Total Eng/Asm Hrs',
    formula: (v) => v.mechanical_design_hrs + v.electrical_design_hrs + v.mechanical_asm_hrs + v.electrical_asm_hrs,
    row: 4,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'number',
    formulaSrc: '=SUM(B22:B23,B27:B28)',
  },
  {
    id: 'total_eng_asm_cost',
    label: 'Total Eng/Asm Cost',
    formula: (v) => v.design_labor_subtotal + v.assembly_labor_subtotal,
    row: 5,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'currency',
    formulaSrc: '=F20+F25',
  },
  {
    id: 'total_material_cost',
    label: 'Total Material Cost',
    formula: (v) => v.electrical_components + v.commercial_mechanical_components + v.manufactured_mechanical_components,
    row: 6,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'currency',
    formulaSrc: '=SUM(F16:F18)',
  },
  {
    id: 'prepaid_supplies',
    label: 'Prepaid Supplies (1.5% of sales)',
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
    label: 'Total Cost',
    formula: (v) =>
      v.total_material_cost +
      v.total_eng_asm_cost +
      v.indirect_labor_cost +
      v.travel_expenses +
      v.prepaid_supplies +
      v.shipping_cost +
      v.sales_commission_amount,
    row: 42,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'currency',
    formulaSrc: '=G6+G5+F30+F32+F34+F36+F38',
  },
  {
    id: 'profit',
    label: 'Profit',
    formula: (v) => v.order_value - v.total_cost,
    row: 44,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'currency',
    formulaSrc: '=G11-G42',
  },
  {
    id: 'profit_margin',
    label: 'Profit Margin',
    formula: (v) => (v.order_value === 0 ? 0 : v.profit / v.order_value),
    row: 45,
    col: 6,
    labelCol: 4,
    labelSpan: true,
    format: 'percentage',
    formulaSrc: '=G44/G11',
  },
] as const

/** All sheet rows are 1-indexed; this is the highest row used (for the renderer to size the grid). */
export const JCR_TOTAL_ROWS = 46
/** Column count: A..G */
export const JCR_TOTAL_COLS = 7
export const JCR_COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

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
