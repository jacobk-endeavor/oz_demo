import {
  resolveAndValidateStructuredSchema,
  type LoadedSchema,
} from './schemaRegistry'
import type { ExtractUnitInput } from './extractArtifact'

type JsonObject = Record<string, unknown>

export type StructuredExtractError =
  | { ok: false; reason: 'invalid_json'; message: string }
  | { ok: false; reason: 'no_schema' }
  | { ok: false; reason: 'schema_validation_failed'; errors: string[] }

export type StructuredExtractResult =
  | {
      ok: true
      units: ExtractUnitInput[]
      chunks: string[]
      schemaName: string
    }
  | StructuredExtractError

function slugPart(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-')
  return normalized.replace(/^-+|-+$/g, '') || 'unknown'
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function productCatalogUnits(payload: JsonObject): ExtractUnitInput[] {
  const itemsRaw = payload.items
  if (!Array.isArray(itemsRaw)) return []
  const items = itemsRaw.filter((row): row is JsonObject => row != null && typeof row === 'object' && !Array.isArray(row))

  const units: ExtractUnitInput[] = []
  const bySubCategory = new Map<string, JsonObject[]>()
  const byLine = new Map<string, JsonObject[]>()

  for (const item of items) {
    const sku = asString(item.sku, 'unknown')
    const description = asString(item.description, 'Unknown product')
    const line = asString(item.product_line_code ?? item.product_line, 'unknown')
    const subCategory = asString(item.sub_category, 'unknown')
    const uom = asString(item.uom, 'unknown')
    const unitPrice = asNumber(item.unit_price_median) ?? asNumber(item.unit_price_avg)
    const qtySold = asNumber(item.total_qty_sold)
    const totalSales = asNumber(item.total_sales)

    const locator = `[catalog:sku=${sku}]`
    const chunkId = `cat_sku_${slugPart(sku)}`
    const body = `${locator}\n${description} - sub-category ${subCategory} in product line ${line}. UoM ${uom}. unit_price ~${unitPrice ?? 'n/a'}, qty_sold ${qtySold ?? 'n/a'}, total_sales ${totalSales ?? 'n/a'}.`
    units.push({
      locator,
      fileName: `unit-catalog-sku-${slugPart(sku)}.txt`,
      body,
      chunkIds: [chunkId],
    })

    const subCategoryItems = bySubCategory.get(subCategory) ?? []
    subCategoryItems.push(item)
    bySubCategory.set(subCategory, subCategoryItems)

    const lineItems = byLine.get(line) ?? []
    lineItems.push(item)
    byLine.set(line, lineItems)
  }

  for (const [subCategory, group] of [...bySubCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const skuCount = group.length
    const qtyTotal = group.reduce((sum, item) => sum + (asNumber(item.total_qty_sold) ?? 0), 0)
    const salesTotal = group.reduce((sum, item) => sum + (asNumber(item.total_sales) ?? 0), 0)
    const locator = `[catalog:sub_category=${subCategory}]`
    units.push({
      locator,
      fileName: `unit-catalog-sub-category-${slugPart(subCategory)}.txt`,
      chunkIds: [`cat_subcat_${slugPart(subCategory)}`],
      body: `${locator}\nSub-category ${subCategory}: ${skuCount} SKUs, total_qty_sold ${qtyTotal}, total_sales ${salesTotal}.`,
    })
  }

  for (const [line, group] of [...byLine.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const skuCount = group.length
    const qtyTotal = group.reduce((sum, item) => sum + (asNumber(item.total_qty_sold) ?? 0), 0)
    const salesTotal = group.reduce((sum, item) => sum + (asNumber(item.total_sales) ?? 0), 0)
    const locator = `[catalog:line=${line}]`
    units.push({
      locator,
      fileName: `unit-catalog-line-${slugPart(line)}.txt`,
      chunkIds: [`cat_line_${slugPart(line)}`],
      body: `${locator}\nProduct line ${line}: ${skuCount} SKUs, total_qty_sold ${qtyTotal}, total_sales ${salesTotal}.`,
    })
  }

  return units
}

function recommendationUnits(payload: JsonObject): ExtractUnitInput[] {
  const groups: Array<{ key: 'cross_sell' | 'upsell' | 'margin_substitution'; short: string }> = [
    { key: 'cross_sell', short: 'xs' },
    { key: 'upsell', short: 'up' },
    { key: 'margin_substitution', short: 'ms' },
  ]

  const units: ExtractUnitInput[] = []
  for (const group of groups) {
    const rulesRaw = payload[group.key]
    if (!Array.isArray(rulesRaw)) continue
    const rules = rulesRaw.filter((row): row is JsonObject => row != null && typeof row === 'object' && !Array.isArray(row))
    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index]!
      const left = asString(rule.left_sku, 'unknown')
      const right = asString(rule.right_sku, 'unknown')
      const coInvoices = asNumber(rule.co_invoices)
      const confidence = asNumber(rule.confidence)
      const lift = asNumber(rule.lift)
      const locator = `[recs:${group.key}:${left}#${index}]`
      const chunkId = `recs_${group.short}_${slugPart(left)}_${index}`
      units.push({
        locator,
        fileName: `unit-recs-${group.key}-${slugPart(left)}-${String(index).padStart(3, '0')}.txt`,
        chunkIds: [chunkId],
        body: `${locator}\n${group.key.replaceAll('_', ' ')} rule: customers who buy ${left} also buy ${right}. co_invoices=${coInvoices ?? 'n/a'}, confidence=${confidence ?? 'n/a'}, lift=${lift ?? 'n/a'}.`,
      })
    }
  }
  return units
}

function buildStructuredUnits(stem: string, payload: JsonObject): ExtractUnitInput[] {
  if (stem === 'product_catalog') return productCatalogUnits(payload)
  if (stem === 'recommendations') return recommendationUnits(payload)
  return []
}

export function extractStructuredData(input: {
  fileName: string
  body: string
  schemas: LoadedSchema[]
}): StructuredExtractResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(input.body)
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid_json',
      message: error instanceof Error ? error.message : 'invalid json',
    }
  }

  const resolved = resolveAndValidateStructuredSchema(input.schemas, input.fileName, parsed)
  if (!resolved.ok) {
    if (resolved.reason === 'schema_validation_failed') {
      return { ok: false, reason: resolved.reason, errors: resolved.errors ?? [] }
    }
    return { ok: false, reason: resolved.reason }
  }

  const payload = parsed as JsonObject
  const units = buildStructuredUnits(resolved.schema.stem, payload)
  return {
    ok: true,
    units,
    chunks: units.map((unit) => unit.body),
    schemaName: resolved.schema.schemaName,
  }
}
