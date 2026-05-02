/**
 * Flatten product_catalog.json (hierarchical product_lines → sub_categories →
 * products) into product_catalog_flat.json (array of SKU records) so
 * TrackCToolScaffold's catalog tools find real data.
 *
 * Idempotent: re-run any time product_catalog.json updates.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type Hierarchical = {
  product_lines?: Array<{
    product_line_code?: string
    product_line?: string
    sub_categories?: Array<{
      sub_category?: string
      products?: Array<{
        sku?: string
        description?: string
        uom?: string
        source_material?: string
        unit_price_avg?: number
        unit_price_median?: number
        unit_cost_avg?: number
        unit_cost_median?: number
        total_qty_sold?: number
        total_sales?: number
      }>
    }>
  }>
}

type FlatRow = {
  sku: string
  product_line_code: string
  product_line: string
  sub_category: string
  source_material: string
  uom: string
  description: string
  unit_price_avg?: number
  unit_price_median?: number
  unit_cost_avg?: number
  unit_cost_median?: number
  total_qty_sold?: number
  total_sales?: number
}

async function main() {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const inPath = path.join(root, 'product_catalog.json')
  const outPath = path.join(root, 'product_catalog_flat.json')
  const raw = await readFile(inPath, 'utf8')
  const data = JSON.parse(raw) as Hierarchical
  const lines = Array.isArray(data.product_lines) ? data.product_lines : []
  const rows: FlatRow[] = []
  for (const line of lines) {
    const product_line_code = (line.product_line_code ?? '').trim()
    const product_line = (line.product_line ?? '').trim()
    for (const sub of line.sub_categories ?? []) {
      const sub_category = (sub.sub_category ?? '').trim()
      for (const p of sub.products ?? []) {
        const sku = (p.sku ?? '').trim()
        if (!sku) continue
        rows.push({
          sku,
          product_line_code,
          product_line,
          sub_category,
          source_material: (p.source_material ?? sku).trim(),
          uom: (p.uom ?? '').trim(),
          description: (p.description ?? '').trim(),
          ...(typeof p.unit_price_avg === 'number' ? { unit_price_avg: p.unit_price_avg } : {}),
          ...(typeof p.unit_price_median === 'number' ? { unit_price_median: p.unit_price_median } : {}),
          ...(typeof p.unit_cost_avg === 'number' ? { unit_cost_avg: p.unit_cost_avg } : {}),
          ...(typeof p.unit_cost_median === 'number' ? { unit_cost_median: p.unit_cost_median } : {}),
          ...(typeof p.total_qty_sold === 'number' ? { total_qty_sold: p.total_qty_sold } : {}),
          ...(typeof p.total_sales === 'number' ? { total_sales: p.total_sales } : {}),
        })
      }
    }
  }
  await writeFile(outPath, JSON.stringify(rows, null, 2), 'utf8')
  const distinctLines = new Set(rows.map((r) => r.product_line).filter(Boolean))
  console.log(
    JSON.stringify({
      ok: true,
      input: path.relative(root, inPath),
      output: path.relative(root, outPath),
      rows: rows.length,
      distinct_product_lines: distinctLines.size,
      sample_lines: [...distinctLines].slice(0, 8),
    }),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
