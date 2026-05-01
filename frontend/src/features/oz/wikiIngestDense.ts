/**
 * Wiki ingest densification: pulls verbatim excerpts, detected entities, and
 * doc-kind-specific highlights from kb_extracts/<source_id>/ into the source
 * page so wiki_lookup body-token matching can surface the doc immediately
 * after ingest (instead of waiting for Linker/Diff agents).
 */
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ExtractManifest } from './extractArtifact'

export type UnitText = {
  locator: string
  chunkIds: string[]
  body: string
}

export async function readUnitTexts(repoRoot: string, manifest: ExtractManifest): Promise<UnitText[]> {
  const out: UnitText[] = []
  for (const unit of manifest.units) {
    if (!unit.file) continue
    const abs = path.join(repoRoot, 'kb_extracts', manifest.source_id, unit.file)
    try {
      await access(abs)
      const body = await readFile(abs, 'utf8')
      out.push({ locator: unit.locator, chunkIds: unit.chunk_ids, body })
    } catch {
      // Missing unit file is non-fatal: density is best-effort.
    }
  }
  return out
}

const BRAND_VOCAB = [
  'AZEK',
  'Deckorators',
  'TimberTech',
  'Trex',
  'Fiberon',
  'MoistureShield',
  'Millboard',
  'Russin',
  'TFP',
  'UFP',
  'Veranda',
] as const

const PRODUCT_LINE_VOCAB = [
  // Deckorators
  'Voyage',
  'Vista',
  'Vault',
  'Venture',
  'Vintage Collection',
  'Legacy Collection',
  'Reserve Collection',
  'Picture Frame Board',
  'Heritage',
  'Frontier',
  // Fiberon
  'Promenade',
  'Paramount',
  'Sanctuary',
  'Good Life',
  'Escapes Collection',
  'Weekender Collection',
  // AZEK
  'Prime+',
  'Harvest Collection',
  'Terrain Collection',
  // TimberTech
  'Captivate',
  'Evolution',
  // Other
  'Black Label',
  'Maximo Thermo',
  'Shadow Line+',
  'Board & Batten+',
  'Westbury Rail',
  'Apex',
] as const

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE_RE = /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]\d{3}[-.\s]\d{4}\b/g

export type DetectedEntities = {
  brands: string[]
  productLines: string[]
  emails: string[]
  phones: string[]
}

function escapeRe(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a case-insensitive regex for a vocabulary term. `\b` only fires between a
 * word char and a non-word char, so tokens that end in `+` (e.g. "Prime+") need
 * their trailing boundary dropped — otherwise `\bPrime\+\b` never matches in
 * "Prime+ Collection" because both sides of `+` are non-word.
 */
function termRegex(literal: string): RegExp {
  const pattern = escapeRe(literal).replace(/\s+/g, '\\s+')
  const left = /^\w/.test(literal) ? '\\b' : ''
  const right = /\w$/.test(literal) ? '\\b' : ''
  return new RegExp(`${left}${pattern}${right}`, 'i')
}

export function detectEntityMentions(text: string, manifest: ExtractManifest): DetectedEntities {
  const brands = new Set<string>()
  const productLines = new Set<string>()
  if (manifest.brand) brands.add(manifest.brand)
  if (manifest.product_line) productLines.add(manifest.product_line)

  for (const b of BRAND_VOCAB) {
    if (termRegex(b).test(text)) brands.add(b)
  }
  for (const pl of PRODUCT_LINE_VOCAB) {
    if (termRegex(pl).test(text)) productLines.add(pl)
  }

  const emails = [...new Set((text.match(EMAIL_RE) ?? []).map((s) => s.trim()))].sort()
  const phoneCandidates = (text.match(PHONE_RE) ?? []).filter((p) => p.replace(/\D/g, '').length >= 10)
  const phones = [...new Set(phoneCandidates.map((s) => s.trim()))].sort()

  return {
    brands: [...brands].sort(),
    productLines: [...productLines].sort(),
    emails,
    phones,
  }
}

const EXCERPT_TOTAL_BUDGET = 5000
const EXCERPT_PER_UNIT = 1200

function truncateAtBoundary(s: string, n: number): string {
  if (s.length <= n) return s
  const slice = s.slice(0, n)
  const lastSp = slice.lastIndexOf(' ')
  return `${(lastSp > n * 0.6 ? slice.slice(0, lastSp) : slice).trimEnd()}…`
}

function normalizeWhitespace(s: string): string {
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function buildExtractedExcerptsSection(units: UnitText[]): string {
  const usable = units.filter((u) => normalizeWhitespace(u.body).length > 0)
  if (usable.length === 0) return ''

  const lines: string[] = ['## Extracted Excerpts']
  let budget = EXCERPT_TOTAL_BUDGET
  for (const unit of usable) {
    if (budget <= 0) break
    const cite = unit.chunkIds[0] ? `[doc:${unit.chunkIds[0]}]` : `[locator:${unit.locator}]`
    const cleaned = normalizeWhitespace(unit.body)
    const allow = Math.min(EXCERPT_PER_UNIT, budget)
    const piece = truncateAtBoundary(cleaned, allow)
    const quoted = piece
      .split('\n')
      .map((line) => (line.length > 0 ? `> ${line}` : '>'))
      .join('\n')
    lines.push(`### ${unit.locator}`, '', quoted, '', cite, '')
    budget -= piece.length
  }
  return `${lines.join('\n')}\n`
}

export function buildDetectedEntitiesSection(d: DetectedEntities): string {
  if (d.brands.length === 0 && d.productLines.length === 0 && d.emails.length === 0 && d.phones.length === 0) {
    return ''
  }
  const lines = ['## Detected Entities']
  if (d.brands.length > 0) lines.push(`- **Brands:** ${d.brands.join(', ')}`)
  if (d.productLines.length > 0) lines.push(`- **Product lines:** ${d.productLines.join(', ')}`)
  if (d.emails.length > 0) lines.push(`- **Emails:** ${d.emails.join(', ')}`)
  if (d.phones.length > 0) lines.push(`- **Phones:** ${d.phones.join(', ')}`)
  lines.push('')
  return `${lines.join('\n')}\n`
}

export function buildWarrantyHighlights(allText: string): string {
  if (!allText) return ''
  const linesIn = allText.split('\n').map((l) => l.trim())
  const stepLines = linesIn.filter((l) => /^\d+\.\s/.test(l) && l.length < 240)
  const sectionLines = linesIn.filter((l) => /^[A-Z]\.\s/.test(l) && l.length < 240)
  const contactLines = linesIn.filter(
    (l) =>
      l.length > 0 &&
      l.length < 240 &&
      (/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(l) ||
        /\b(?:Manager|Services|Supervisor|Director)\b/i.test(l) ||
        /\bFax:/i.test(l)),
  )

  if (stepLines.length === 0 && sectionLines.length === 0 && contactLines.length === 0) return ''

  const lines = ['## Warranty Highlights']
  if (stepLines.length > 0) {
    lines.push('### Procedure (verbatim)')
    for (const s of stepLines.slice(0, 12)) lines.push(`- ${s}`)
  }
  if (sectionLines.length > 0) {
    lines.push('### Notes (verbatim)')
    for (const s of sectionLines.slice(0, 10)) lines.push(`- ${s}`)
  }
  if (contactLines.length > 0) {
    lines.push('### Contacts')
    for (const c of contactLines.slice(0, 10)) lines.push(`- ${c}`)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

const COLOR_HEADING_RE = /^[A-Z][A-Z0-9 +&\-/'™®©.]{2,}$/

export function buildVisualCatalogHighlights(allText: string): string {
  if (!allText) return ''
  const blocks = allText.split(/\n\s*Compare to:\s*\n?/i)
  if (blocks.length < 2) return ''

  const pairs: string[] = []
  for (let i = 1; i < blocks.length && pairs.length < 30; i++) {
    const prevTail = blocks[i - 1]
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(-4)
    const sourceColor = [...prevTail].reverse().find((l) => COLOR_HEADING_RE.test(l) && l.length < 50)
    const targetText = blocks[i]
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 6)
      .join(' ')
    if (!sourceColor || !targetText) continue
    pairs.push(`- **${sourceColor.trim()}** → ${truncateAtBoundary(targetText, 200)}`)
  }
  if (pairs.length === 0) return ''
  return `## Color Equivalence Pairs\n${pairs.join('\n')}\n\n`
}

function slugifyTag(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deriveTags(manifest: ExtractManifest, d: DetectedEntities): string[] {
  const tags = new Set<string>()
  if (manifest.doc_kind && manifest.doc_kind !== 'unknown') tags.add(manifest.doc_kind)
  if (manifest.brand) tags.add(slugifyTag(manifest.brand))
  if (manifest.product_line) tags.add(slugifyTag(manifest.product_line))
  if (manifest.year != null) tags.add(String(manifest.year))
  for (const b of d.brands) tags.add(slugifyTag(b))
  for (const pl of d.productLines) tags.add(slugifyTag(pl))
  return [...tags].filter((t) => t.length > 0).slice(0, 16)
}

export type DenseSourcePageInputs = {
  unitTexts: UnitText[]
  detected: DetectedEntities
  manifest: ExtractManifest
}

export type DenseSourcePageOutput = {
  /** Markdown block to inject into the source page between Summary and Playbook. */
  densityBlocks: string
  /** Tag list for frontmatter `tags` field. */
  tags: string[]
}

export function buildDenseSourcePageBlocks(input: DenseSourcePageInputs): DenseSourcePageOutput {
  const { unitTexts, detected, manifest } = input
  const fullText = unitTexts.map((u) => u.body).join('\n\n')
  const blocks: string[] = []
  const entitiesSection = buildDetectedEntitiesSection(detected)
  if (entitiesSection) blocks.push(entitiesSection)
  if (manifest.doc_kind === 'warranty') {
    const wh = buildWarrantyHighlights(fullText)
    if (wh) blocks.push(wh)
  }
  if (manifest.doc_kind === 'visual-catalog') {
    const vh = buildVisualCatalogHighlights(fullText)
    if (vh) blocks.push(vh)
  }
  const excerpts = buildExtractedExcerptsSection(unitTexts)
  if (excerpts) blocks.push(excerpts)
  return {
    densityBlocks: blocks.join(''),
    tags: deriveTags(manifest, detected),
  }
}
