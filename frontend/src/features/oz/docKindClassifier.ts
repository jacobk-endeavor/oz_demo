const EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods', '.csv'])

export const DOC_KINDS = [
  'marketing',
  'spec-sheet',
  'install',
  'tech-bulletin',
  'visual-catalog',
  'master-spec',
  'catalog',
  'warranty',
  'presentation',
  'tabular-reference',
  'order-guide',
  'structured-data',
  'unknown',
] as const

export type DocKind = (typeof DOC_KINDS)[number]

export type DocKindClassification = {
  doc_kind: DocKind
  confidence: number
  matched_by: 'filename' | 'content' | 'fallback'
  signals: string[]
  brand?: string
  product_line?: string
  year?: number
  distributor_branded?: boolean
}

type ClassifierRule = {
  docKind: Exclude<DocKind, 'unknown'>
  patterns: RegExp[]
}

const FILENAME_RULES: ClassifierRule[] = [
  { docKind: 'tech-bulletin', patterns: [/\btechnical bulletin\b/i] },
  { docKind: 'master-spec', patterns: [/\bmaster spec\b/i] },
  { docKind: 'order-guide', patterns: [/\border guide\b/i, /\bsku list\b/i] },
  { docKind: 'warranty', patterns: [/\bwarranty\b/i] },
  { docKind: 'catalog', patterns: [/\bline card\b/i, /\bproduct catalog\b/i, /\bproduct[- ]offerings\b/i] },
  { docKind: 'spec-sheet', patterns: [/\bsell sheet\b/i, /\bsales sheet\b/i] },
  { docKind: 'install', patterns: [/\binstall guide\b/i, /\binstallation instructions\b/i, /\binstall instructions\b/i] },
  { docKind: 'visual-catalog', patterns: [/\bcolor comparison\b/i, /\bcolor chart\b/i] },
  { docKind: 'marketing', patterns: [/\bbrochure\b/i, /\boverview\b/i] },
  { docKind: 'presentation', patterns: [/\bpresentation\b/i] },
]

const CONTENT_RULES: ClassifierRule[] = [
  { docKind: 'install', patterns: [/\binstallation instructions\b/i, /\binstall guide\b/i] },
  { docKind: 'warranty', patterns: [/\bwarranty\b/i] },
  { docKind: 'catalog', patterns: [/\bproduct catalog\b/i, /\bline card\b/i] },
  { docKind: 'tech-bulletin', patterns: [/\btechnical bulletin\b/i] },
  { docKind: 'spec-sheet', patterns: [/\bsell sheet\b/i, /\bsales sheet\b/i] },
  { docKind: 'master-spec', patterns: [/\bmaster spec\b/i] },
  { docKind: 'order-guide', patterns: [/\border guide\b/i] },
]

const BRANDS = ['AZEK', 'Deckorators', 'TimberTech', 'Trex', 'Fiberon', 'Millboard', 'Russin', 'TFP'] as const
const PRODUCT_LINES = [
  'Captivate',
  'Evolution',
  'Black Label',
  'Maximo Thermo',
  'Shadow Line+',
] as const

function fileExt(path: string): string {
  const i = path.lastIndexOf('.')
  return i >= 0 ? path.slice(i).toLowerCase() : ''
}

function matchRule(text: string, rules: ClassifierRule[]): { docKind: DocKind; signal: string } | null {
  for (const rule of rules) {
    for (const p of rule.patterns) {
      if (p.test(text)) {
        return { docKind: rule.docKind, signal: p.source }
      }
    }
  }
  return null
}

function pickBrand(text: string): string | undefined {
  const lower = text.toLowerCase()
  for (const brand of BRANDS) {
    if (lower.includes(brand.toLowerCase())) return brand
  }
  return undefined
}

function pickProductLine(text: string): string | undefined {
  const lower = text.toLowerCase()
  for (const line of PRODUCT_LINES) {
    if (lower.includes(line.toLowerCase())) return line
  }
  return undefined
}

function pickYear(text: string): number | undefined {
  const m = text.match(/\b(20\d{2})\b/)
  if (m == null) return undefined
  const y = Number(m[1])
  if (!Number.isInteger(y) || y < 2023 || y > 2026) return undefined
  return y
}

export function classifyDocKind(input: {
  path: string
  mime: string
  firstPageText?: string
  docKindOverride?: string
}): DocKindClassification {
  const path = input.path.trim()
  const mime = input.mime.trim().toLowerCase()
  const firstPage = (input.firstPageText ?? '').trim()
  const basename = path.split(/[\\/]/).pop() ?? path
  const normalizedBasename = basename.replace(/[_+.]+/g, ' ')
  const ext = fileExt(path)
  const normalized = basename.toLowerCase()
  const contextText = `${basename}\n${firstPage}`

  if (input.docKindOverride != null && input.docKindOverride.trim().length > 0) {
    const override = input.docKindOverride.trim() as DocKind
    return {
      doc_kind: override,
      confidence: 1,
      matched_by: 'fallback',
      signals: ['doc_kind_override'],
      brand: pickBrand(contextText),
      product_line: pickProductLine(contextText),
      year: pickYear(contextText),
      distributor_branded: /russin logo|with russin/i.test(contextText),
    }
  }

  if (ext === '.pptx' || mime.includes('presentation')) {
    return {
      doc_kind: 'presentation',
      confidence: 1,
      matched_by: 'filename',
      signals: [ext === '.pptx' ? 'ext:pptx' : 'mime:presentation'],
      brand: pickBrand(contextText),
      product_line: pickProductLine(contextText),
      year: pickYear(contextText),
      distributor_branded: /russin logo|with russin/i.test(contextText),
    }
  }

  if (EXCEL_EXTENSIONS.has(ext) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return {
      doc_kind: 'tabular-reference',
      confidence: 1,
      matched_by: 'filename',
      signals: [`ext:${ext || 'unknown'}`],
      brand: pickBrand(contextText),
      product_line: pickProductLine(contextText),
      year: pickYear(contextText),
      distributor_branded: /russin logo|with russin/i.test(contextText),
    }
  }

  if (ext === '.json' && /product_catalog|recommendations/i.test(normalized)) {
    return {
      doc_kind: 'structured-data',
      confidence: 1,
      matched_by: 'filename',
      signals: ['filename:known-json-structured-source'],
      brand: pickBrand(contextText),
      product_line: pickProductLine(contextText),
      year: pickYear(contextText),
      distributor_branded: /russin logo|with russin/i.test(contextText),
    }
  }

  const filenameMatch = matchRule(normalizedBasename, FILENAME_RULES)
  if (filenameMatch != null) {
    return {
      doc_kind: filenameMatch.docKind,
      confidence: 1,
      matched_by: 'filename',
      signals: [filenameMatch.signal],
      brand: pickBrand(contextText),
      product_line: pickProductLine(contextText),
      year: pickYear(contextText),
      distributor_branded: /russin logo|with russin/i.test(contextText),
    }
  }

  if (firstPage.length > 0) {
    const contentMatch = matchRule(firstPage, CONTENT_RULES)
    if (contentMatch != null) {
      return {
        doc_kind: contentMatch.docKind,
        confidence: 0.8,
        matched_by: 'content',
        signals: [contentMatch.signal],
        brand: pickBrand(contextText),
        product_line: pickProductLine(contextText),
        year: pickYear(contextText),
        distributor_branded: /russin logo|with russin/i.test(contextText),
      }
    }
  }

  return {
    doc_kind: 'unknown',
    confidence: 0,
    matched_by: 'fallback',
    signals: ['no-match'],
    brand: pickBrand(contextText),
    product_line: pickProductLine(contextText),
    year: pickYear(contextText),
    distributor_branded: /russin logo|with russin/i.test(contextText),
  }
}
