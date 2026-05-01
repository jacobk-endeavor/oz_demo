import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ExtractManifest, ExtractManifestUnit } from './extractArtifact'

type JsonObject = Record<string, unknown>

const TEXT_PLAYBOOK_KINDS = new Set([
  'marketing',
  'install',
  'tech-bulletin',
  'master-spec',
  'warranty',
  'order-guide',
  'spec-sheet',
])

const VISUAL_PLAYBOOK_KINDS = new Set(['visual-catalog', 'presentation', 'tabular-reference'])

function quoteYamlString(input: string): string {
  return `"${input.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function dayStamp(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function slugifyWikiSegment(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'unknown'
}

export function normalizeIngestManifest(raw: unknown): ExtractManifest {
  const r = raw as Partial<ExtractManifest> & {
    units?: Array<Partial<ExtractManifestUnit> & { chunk_ids?: string[] }>
  }
  const units: ExtractManifestUnit[] = (r.units ?? []).map((unit, index) => ({
    locator: typeof unit.locator === 'string' ? unit.locator : `unit-${index}`,
    file: typeof unit.file === 'string' ? unit.file : 'legacy.txt',
    chunk_ids: Array.isArray(unit.chunk_ids) ? unit.chunk_ids : [],
    content_hash: typeof unit.content_hash === 'string' ? unit.content_hash : '',
    ...(unit.images != null ? { images: unit.images } : {}),
    ...(unit.meta != null ? { meta: unit.meta } : {}),
  }))

  return {
    manifest_version: 1,
    source_id: typeof r.source_id === 'string' ? r.source_id : 'unknown',
    title: typeof r.title === 'string' ? r.title : 'unknown',
    doc_kind: (typeof r.doc_kind === 'string' ? r.doc_kind : 'unknown') as ExtractManifest['doc_kind'],
    has_full_text: typeof r.has_full_text === 'boolean' ? r.has_full_text : false,
    ...(typeof r.full_text_file === 'string' ? { full_text_file: r.full_text_file } : {}),
    ...(typeof r.brand === 'string' ? { brand: r.brand } : {}),
    ...(typeof r.product_line === 'string' ? { product_line: r.product_line } : {}),
    ...(typeof r.year === 'number' ? { year: r.year } : {}),
    ...(typeof r.distributor_branded === 'boolean' ? { distributor_branded: r.distributor_branded } : {}),
    units,
  }
}

export async function tryReadFullExtractText(repoRoot: string, manifest: ExtractManifest): Promise<string | null> {
  const rel = manifest.full_text_file ?? 'full.txt'
  const fullPath = path.join(repoRoot, 'kb_extracts', manifest.source_id, rel)
  try {
    await access(fullPath)
    return await readFile(fullPath, 'utf8')
  } catch {
    return null
  }
}

export async function tryReadRepoJson(repoRoot: string, fileName: string): Promise<JsonObject | null> {
  const p = path.join(repoRoot, fileName)
  try {
    await access(p)
    const raw = await readFile(p, 'utf8')
    return JSON.parse(raw) as JsonObject
  } catch {
    return null
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

export function loadProductCatalogSkuSet(payload: JsonObject): Set<string> {
  const itemsRaw = payload.items
  const out = new Set<string>()
  if (!Array.isArray(itemsRaw)) return out
  for (const row of itemsRaw) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) continue
    const sku = asString((row as JsonObject).sku, '')
    if (sku.length > 0) out.add(sku.toUpperCase())
  }
  return out
}

/** SKU-like tokens in loose documents (line cards, sell sheets). */
export function extractSkuLikeTokens(text: string): string[] {
  const found = new Set<string>()
  const re = /\b[A-Z0-9][A-Z0-9-]{3,15}\b/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) != null) {
    found.add(match[0].toUpperCase())
  }
  return [...found].sort()
}

export type CatalogCrossRefResult = {
  matchedInCatalog: string[]
  pdfNotInCatalog: string[]
  catalogNotInPdf: string[]
}

export function crossReferenceCatalogSkus(input: {
  fullText: string
  catalogSkus: Set<string>
  /** When set, only SKUs whose catalog row matches this product_line string are considered for discontinuation hints. */
  productLineFilter?: string
  catalogItems?: JsonObject[]
}): CatalogCrossRefResult {
  const tokens = extractSkuLikeTokens(input.fullText)
  const matchedInCatalog: string[] = []
  const pdfNotInCatalog: string[] = []

  for (const token of tokens) {
    if (input.catalogSkus.has(token)) matchedInCatalog.push(token)
    else pdfNotInCatalog.push(token)
  }

  let catalogNotInPdf: string[] = []
  if (input.catalogItems != null && input.catalogItems.length > 0) {
    const mentioned = new Set(matchedInCatalog)
    const filter = input.productLineFilter?.trim()
    for (const row of input.catalogItems) {
      const sku = asString(row.sku, '')
      if (sku.length === 0) continue
      if (filter != null && filter.length > 0) {
        const line = asString(row.product_line, '')
        if (line !== filter) continue
      }
      if (!mentioned.has(sku.toUpperCase())) catalogNotInPdf.push(sku.toUpperCase())
    }
    catalogNotInPdf = [...new Set(catalogNotInPdf)].sort()
  }

  return {
    matchedInCatalog: [...new Set(matchedInCatalog)].sort(),
    pdfNotInCatalog: [...new Set(pdfNotInCatalog)].sort(),
    catalogNotInPdf,
  }
}

function textPlaybookBody(docKind: string, manifest: ExtractManifest): string {
  const brand = manifest.brand ?? 'unknown'
  const line = manifest.product_line ?? 'unknown'
  const blocks: Record<string, string> = {
    marketing: [
      '- **Read:** full extract; vision pass on cover and hero pages.',
      `- **Draft focus:** positioning, benefits, use cases, color/finish callouts for **${line}** (${brand}).`,
      '- **Linker targets:** `entities/products/<product-line>`, `entities/brands/<brand>`, concept stubs for application contexts.',
      '- **Watch:** warranty length, region, brochure year for contradiction signals.',
    ].join('\n'),
    install: [
      '- **Read:** full extract; preserve numbered steps verbatim; vision pass on diagram pages.',
      '- **Draft focus:** step outline, tools/materials, tolerances, fastener/spacing requirements.',
      `- **Linker targets:** \`concepts/install/${slugifyWikiSegment(line)}\`, \`entities/products/<product-line>\`.`,
      '- **Diff hook:** compare against prior install guides for the same product line for procedural drift.',
    ].join('\n'),
    'tech-bulletin': [
      '- **Read:** full extract (typically short).',
      '- **Draft focus:** tradeoff / comparison narrative with dense `[doc:<chunk_id>]` citations.',
      '- **Linker targets:** concept pages (topic-shaped); cite `[catalog:sku=…]` for every SKU referenced.',
    ].join('\n'),
    'master-spec': [
      '- **Read:** full extract; preserve mechanical property tables.',
      '- **Draft focus:** minimal source summary — structured fields migrate toward `entities/species/<species>`.',
      '- **Linker targets:** `entities/species/<species>` with Janka/density/grades frontmatter when identifiable.',
    ].join('\n'),
    warranty: [
      '- **Read:** full extract; legal-grade text — **no paraphrase** in excerpts.',
      '- **Draft focus:** verbatim term excerpts with chunk citations.',
      `- **Linker targets:** \`concepts/warranty/${slugifyWikiSegment(brand)}-<product>-<year>\`, product line warranty section.`,
    ].join('\n'),
    'order-guide': [
      '- **Read:** full extract; configuration tables drive ordering logic.',
      '- **Draft focus:** decision tree (post → bracket → cable → fastener) and part-number table.',
      `- **Linker targets:** \`concepts/configuration/${slugifyWikiSegment(line)}\`.`,
    ].join('\n'),
    'spec-sheet': [
      '- **Read:** full extract; selling points + specs tables.',
      '- **Draft focus:** claims vs catalog facts; cite docs + catalog rows together when SKU-level truth exists.',
      '- **Linker targets:** `entities/products/<product-line>`, `entities/brands/<brand>`.',
    ].join('\n'),
  }
  return blocks[docKind] ?? ''
}

function visualPlaybookBody(docKind: string, manifest: ExtractManifest): string {
  const line = manifest.product_line ?? 'unknown'
  const blocks: Record<string, string> = {
    'visual-catalog': [
      '- **Multimodal:** vision pass **mandatory** — text extract is sparse.',
      '- **Per page:** caption swatches (color name, tone, brand-equivalence hints).',
      `- **Linker targets:** \`entities/products/${slugifyWikiSegment(line)}\` Colors table; \`concepts/color-equivalence/<family>\`.`,
      '- **Citations:** mix `[doc:<chunk_id>]` with `[image:<source_id>/img/page-<n>.png]`.',
    ].join('\n'),
    presentation: [
      '- **Multimodal:** vision pass **per slide** when layout-heavy.',
      '- **Read order:** speaker notes first when present (sales narrative).',
      '- **Draft focus:** slide-level summaries reinforcing existing entities/concepts (usually no new stubs).',
    ].join('\n'),
    'tabular-reference': [
      '- **Structure:** each sheet is a logical unit; map sheet → entity updates.',
      '- **Multimodal:** optional vision assist on embedded charts; cite `[doc:<chunk_id>]` per row range.',
      `- **Linker targets:** often \`entities/products/${slugifyWikiSegment(line)}\` color / SKU tables.`,
    ].join('\n'),
  }
  return blocks[docKind] ?? ''
}

export function buildPlaybookPlanSection(input: {
  manifest: ExtractManifest
  fullText: string | null
  catalogPayload: JsonObject | null
}): string {
  const { manifest } = input
  const dk = manifest.doc_kind

  if (dk === 'catalog') {
    const catalogSkus = input.catalogPayload != null ? loadProductCatalogSkuSet(input.catalogPayload) : null
    const items =
      input.catalogPayload != null && Array.isArray(input.catalogPayload.items)
        ? (input.catalogPayload.items as JsonObject[])
        : undefined
    const cross =
      input.fullText != null && catalogSkus != null
        ? crossReferenceCatalogSkus({
            fullText: input.fullText,
            catalogSkus,
            productLineFilter: manifest.product_line,
            catalogItems: items,
          })
        : null

    const citeMatched =
      cross != null
        ? cross.matchedInCatalog.map((sku) => `- Confirmed catalog SKU mention → \`[catalog:sku=${sku}]\``).join('\n')
        : '- (Cross-reference requires `product_catalog.json` at repo root and `full.txt` extract.)'

    const pdfMissing =
      cross != null && cross.pdfNotInCatalog.length > 0
        ? cross.pdfNotInCatalog.map((sku) => `- **MISSING-SKU:** tokenized \`${sku}\` not found in catalog — lint queue.`).join('\n')
        : '- No orphan SKU-like tokens beyond catalog (or full text missing).'

    const catalogMissing =
      cross != null && cross.catalogNotInPdf.length > 0
        ? cross.catalogNotInPdf
            .slice(0, 40)
            .map((sku) => `- Catalog SKU **${sku}** not tokenized in this PDF — potential discontinuation / omission.`)
            .join('\n')
        : '- No catalog-only discontinuation hints for this product line filter (or filter unset).'

    return [
      `## Playbook: catalog`,
      '- **Read:** full extract — tabular listings dominate.',
      '- **Draft focus:** breadth summary (families, geographies, SKU counts).',
      '### SKU cross-reference',
      citeMatched,
      '### PDF tokens not in catalog',
      pdfMissing,
      '### Catalog SKUs not surfaced in PDF',
      catalogMissing,
      '- **Linker targets:** `entities/brands/<brand>` SKU index; queue Diff jobs for entity tables.',
      '',
    ].join('\n')
  }

  if (TEXT_PLAYBOOK_KINDS.has(dk)) {
    const body = textPlaybookBody(dk, manifest)
    return [`## Playbook: ${dk}`, body, ''].join('\n')
  }

  if (VISUAL_PLAYBOOK_KINDS.has(dk)) {
    const multimodal =
      dk === 'visual-catalog' || dk === 'presentation'
        ? 'mandatory_multimodal_vision: true'
        : 'mandatory_multimodal_vision: false'
    const body = visualPlaybookBody(dk, manifest)
    return [`## Playbook: ${dk}`, `- **${multimodal}**`, body, ''].join('\n')
  }

  if (dk === 'structured-data') {
    return [
      '## Playbook: structured-data',
      '- **Pathway:** catalog + recommendations bootstrap — see **Structured-data artifacts** section below.',
      '- **Citations:** `[catalog:…]` / `[recs:…]` chunk IDs from structured extractor units.',
      '',
    ].join('\n')
  }

  return ''
}

export type StructuredStem = 'product_catalog' | 'recommendations' | null

export function detectStructuredStem(title: string): StructuredStem {
  const t = title.toLowerCase()
  if (t.includes('product_catalog')) return 'product_catalog'
  if (t.includes('recommendations')) return 'recommendations'
  return null
}

export async function runStructuredDataWikiBootstrap(input: {
  repoRoot: string
  manifest: ExtractManifest
  now: Date
}): Promise<{ writtenPaths: string[] }> {
  const stem = detectStructuredStem(input.manifest.title)
  const writtenPaths: string[] = []
  if (stem == null) return { writtenPaths }

  if (stem === 'product_catalog') {
    const payload = await tryReadRepoJson(input.repoRoot, 'product_catalog.json')
    if (payload == null) return { writtenPaths }

    await mkdir(path.join(input.repoRoot, 'wiki', 'entities', 'products'), { recursive: true })

    const itemsRaw = payload.items
    if (!Array.isArray(itemsRaw)) return { writtenPaths }

    const items = itemsRaw.filter((row): row is JsonObject => row != null && typeof row === 'object' && !Array.isArray(row))

    const byLine = new Map<string, JsonObject[]>()
    for (const item of items) {
      const code = asString(item.product_line_code, 'unknown')
      const group = byLine.get(code) ?? []
      group.push(item)
      byLine.set(code, group)
    }

    for (const [, group] of byLine) {
      const first = group[0]
      if (first == null) continue
      const title = asString(first.product_line, 'unknown')
      const slug = slugifyWikiSegment(title)
      const filePath = path.join(input.repoRoot, 'wiki', 'entities', 'products', `${slug}.md`)
      try {
        await access(filePath)
      } catch {
        const subCategories = [...new Set(group.map((row) => asString(row.sub_category, '')).filter((s) => s.length > 0))].sort()
        const skuCount = group.length
        const totalSales = group.reduce((sum, row) => sum + (typeof row.total_sales === 'number' ? row.total_sales : 0), 0)
        const created = dayStamp(input.now)
        const page = `---
type: entity
slug: ${quoteYamlString(`products/${slug}`)}
title: ${quoteYamlString(title)}
created: ${created}
updated: ${created}
source_count: 0
related: []
tags: [product-line, structured-catalog]
confidence: medium
product_line_code: ${quoteYamlString(asString(first.product_line_code, ''))}
sub_categories: [${subCategories.map((s) => quoteYamlString(s)).join(', ')}]
sku_count: ${String(skuCount)}
total_sales_year: ${totalSales.toFixed(2)}
catalog_refresh: ${created}
---

## Positioning
- _Awaiting narrative sources._

## Claims
- _Awaiting document-backed claims._

## Top SKUs (by catalog motion)
- _Diff Agent will rank using structured refreshes._

## Cross-sell / Upsell
- See [[concepts/recommendations/cross-sell]], [[concepts/recommendations/upsell]], [[concepts/recommendations/margin-substitution]].
`
        await writeFile(filePath, page, 'utf8')
        writtenPaths.push(filePath)
      }
    }
  }

  if (stem === 'recommendations') {
    const payload = await tryReadRepoJson(input.repoRoot, 'recommendations.json')
    if (payload == null) return { writtenPaths }

    await mkdir(path.join(input.repoRoot, 'wiki', 'concepts', 'recommendations'), { recursive: true })

    const kinds = [
      { key: 'cross_sell' as const, slug: 'cross-sell' },
      { key: 'upsell' as const, slug: 'upsell' },
      { key: 'margin_substitution' as const, slug: 'margin-substitution' },
    ]

    for (const kind of kinds) {
      const rulesRaw = payload[kind.key]
      const rules = Array.isArray(rulesRaw)
        ? rulesRaw.filter((row): row is JsonObject => row != null && typeof row === 'object' && !Array.isArray(row))
        : []

      const top = [...rules]
        .sort((a, b) => {
          const lb = typeof b.lift === 'number' ? b.lift : 0
          const la = typeof a.lift === 'number' ? a.lift : 0
          return lb - la
        })
        .slice(0, 15)

      const filePath = path.join(input.repoRoot, 'wiki', 'concepts', 'recommendations', `${kind.slug}.md`)
      try {
        await access(filePath)
      } catch {
        const created = dayStamp(input.now)
        const rows = top
          .map((rule) => {
            const left = asString(rule.left_sku, '')
            const right = asString(rule.right_sku, '')
            const lift = typeof rule.lift === 'number' ? rule.lift : null
            const ruleIndex = rules.findIndex(
              (candidate) =>
                asString(candidate.left_sku, '') === left && asString(candidate.right_sku, '') === right,
            )
            const citeIndex = ruleIndex >= 0 ? ruleIndex : 0
            const cite = `[recs:${kind.key}:${left}#${citeIndex}]`
            return `| ${left} | ${right} | ${lift != null ? lift.toFixed(2) : 'n/a'} | ${cite} |`
          })
          .join('\n')

        const page = `---
type: concept
slug: ${quoteYamlString(`concepts/recommendations/${kind.slug}`)}
title: ${quoteYamlString(`${kind.key.replaceAll('_', ' ')} — top rules`)}
created: ${created}
updated: ${created}
source_count: 1
related: []
tags: [recommendations, structured-data]
confidence: medium
---

## Top rules (lift)

| left_sku | right_sku | lift | citation |
| --- | --- | --- | --- |
${rows}

## Notes
- Tables are bootstrap summaries; Diff Agent refines with narrative context from documents and calls.
`
        await writeFile(filePath, page, 'utf8')
        writtenPaths.push(filePath)
      }
    }

    const methodologyPath = path.join(input.repoRoot, 'wiki', 'concepts', 'recommendations', 'methodology.md')
    try {
      await access(methodologyPath)
    } catch {
      const notesField = payload.notes
      const notes =
        typeof notesField === 'string' && notesField.trim().length > 0
          ? notesField.trim()
          : 'Methodology block pending — populate when recommendations export carries methodology prose.'
      const created = dayStamp(input.now)
      const page = `---
type: concept
slug: concepts/recommendations/methodology
title: Recommendation methodology
created: ${created}
updated: ${created}
source_count: 1
related: []
tags: [recommendations, methodology]
confidence: medium
---

${notes}
`
      await writeFile(methodologyPath, page, 'utf8')
      writtenPaths.push(methodologyPath)
    }
  }

  return { writtenPaths }
}

export function buildLazySkuSection(manifest: ExtractManifest): string {
  /** Count sku locators from structured extractor chunks */
  const skuLocators = manifest.units
    .map((u) => u.locator)
    .filter((loc) => /\[catalog:sku=/i.test(loc))
  const unique = [...new Set(skuLocators)]
  if (unique.length === 0) {
    return [
      '## Lazy SKU policy',
      '- SKU entity pages (`entities/skus/<sku>`) stay lazy — created after ≥3 qualifying mentions across sources or explicit user engagement.',
      '',
    ].join('\n')
  }

  const preview = unique.slice(0, 12).map((loc) => `- ${loc}`).join('\n')
  return [
    '## Lazy SKU policy',
    '- SKU entity pages remain lazy; structured rows below seed `[catalog:sku=…]` citations for downstream Diff.',
    '### SKU aggregate rows (structured ingest)',
    preview,
    '',
  ].join('\n')
}

export function buildNearDuplicateSection(input: {
  nearDuplicateSourceIds: string[]
  supersedesSlug?: string
  distributorBranded?: boolean
}): string {
  const lines: string[] = ['## Near-duplicate / supersession']
  if (input.supersedesSlug != null && input.supersedesSlug.trim().length > 0) {
    lines.push(`- Recorded **supersedes** candidate → \`${input.supersedesSlug.trim()}\` (Diff prefers newer evidence).`)
  } else {
    lines.push('- No explicit `supersedes` hint on this ingest event.')
  }
  if (input.distributorBranded === true) {
    lines.push('- **distributor_branded:** keep distinct from canonical sell sheet; link as variant — no auto-merge.')
  }
  if (input.nearDuplicateSourceIds.length > 0) {
    lines.push('- **Curator review:** potential duplicates detected — do **not** auto-merge.')
    for (const id of input.nearDuplicateSourceIds) {
      lines.push(`  - near_duplicate source_id=\`${id}\``)
    }
  } else {
    lines.push('- No near-duplicate registry hints on this ingest event.')
  }
  lines.push('')
  return lines.join('\n')
}
