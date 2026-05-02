/**
 * Flatten recommendations.json into the row shape the TrackC scaffold reads.
 *
 * Source (as exported from the analytics pipeline — three arrays of anchors):
 *   {
 *     "cross_sell_by_subcategory": [
 *       { "sub_category", "invoices_with_subcat",
 *         "recommendations": [{ "recommend", "co_invoices", "confidence", "lift" }, ...] }
 *     ],
 *     "upsell_by_sku": [
 *       { "sku", "description", "sub_category", "unit_price_median", "gp_pct_median",
 *         "recommendations": [{ "sku", "description", "unit_price_median", "gp_pct_median",
 *                              "price_uplift_pct" }, ...] }
 *     ],
 *     "margin_substitution_by_sku": [
 *       { "sku", "description", ...,
 *         "alternatives": [{ "sku", "description", "gp_pct_uplift_pp",
 *                            "price_diff_pct", "invoice_count" }, ...] }
 *     ]
 *   }
 *
 * Target (flat array — matches recommendationsIndex.ts readers):
 *   [
 *     { rule_kind: 'cross_sell', sub_category, recommend, lift, confidence, co_invoices, ... },
 *     { rule_kind: 'upsell',     from_sku,     recommend, lift, confidence, co_invoices, ... },
 *     { rule_kind: 'margin_substitution', from_sku, recommend, lift, confidence, co_invoices, ... },
 *   ]
 *
 * Idempotent: re-run any time recommendations.json refreshes.
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type CrossRule = {
  recommend?: string
  co_invoices?: number
  confidence?: number
  lift?: number
}

type CrossEntry = {
  sub_category?: string
  invoices_with_subcat?: number
  recommendations?: CrossRule[]
}

type UpsellRule = {
  sku?: string
  description?: string
  unit_price_median?: number
  gp_pct_median?: number
  price_uplift_pct?: number
}

type UpsellEntry = {
  sku?: string
  description?: string
  sub_category?: string
  unit_price_median?: number
  gp_pct_median?: number
  recommendations?: UpsellRule[]
}

type SubstitutionRule = {
  sku?: string
  description?: string
  unit_price_median?: number
  gp_pct_median?: number
  gp_pct_uplift_pp?: number
  price_diff_pct?: number
  invoice_count?: number
}

type SubstitutionEntry = {
  sku?: string
  description?: string
  sub_category?: string
  unit_price_median?: number
  gp_pct_median?: number
  alternatives?: SubstitutionRule[]
}

type Source = {
  cross_sell_by_subcategory?: CrossEntry[]
  upsell_by_sku?: UpsellEntry[]
  margin_substitution_by_sku?: SubstitutionEntry[]
  generated_at?: string
  source_file?: string
  notes?: string
}

type FlatRow = {
  rule_kind: 'cross_sell' | 'upsell' | 'margin_substitution'
  sub_category?: string
  from_sku?: string
  /** Anchor description for nicer UI rendering. */
  from_description?: string
  recommend: string
  recommend_description?: string
  lift?: number
  confidence?: number
  co_invoices?: number
  invoices_with_anchor?: number
  // Upsell-specific
  price_uplift_pct?: number
  // Margin-substitution-specific
  gp_pct_uplift_pp?: number
  price_diff_pct?: number
  invoice_count?: number
}

async function main() {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const inPath = path.join(root, 'recommendations.json')
  const outPath = path.join(root, 'recommendations_flat.json')
  const raw = await readFile(inPath, 'utf8')
  const data = JSON.parse(raw) as Source
  const rows: FlatRow[] = []

  for (const entry of data.cross_sell_by_subcategory ?? []) {
    const sub_category = String(entry.sub_category ?? '').trim()
    if (!sub_category) continue
    for (const rule of entry.recommendations ?? []) {
      const recommend = String(rule.recommend ?? '').trim()
      if (!recommend) continue
      rows.push({
        rule_kind: 'cross_sell',
        sub_category,
        recommend,
        ...(typeof rule.lift === 'number' ? { lift: rule.lift } : {}),
        ...(typeof rule.confidence === 'number' ? { confidence: rule.confidence } : {}),
        ...(typeof rule.co_invoices === 'number' ? { co_invoices: rule.co_invoices } : {}),
        ...(typeof entry.invoices_with_subcat === 'number'
          ? { invoices_with_anchor: entry.invoices_with_subcat }
          : {}),
      })
    }
  }

  for (const entry of data.upsell_by_sku ?? []) {
    const from_sku = String(entry.sku ?? '').trim().toUpperCase()
    if (!from_sku) continue
    for (const rule of entry.recommendations ?? []) {
      const recommend = String(rule.sku ?? '').trim()
      if (!recommend) continue
      rows.push({
        rule_kind: 'upsell',
        from_sku,
        ...(entry.description ? { from_description: entry.description } : {}),
        recommend,
        ...(rule.description ? { recommend_description: rule.description } : {}),
        ...(typeof rule.price_uplift_pct === 'number' ? { price_uplift_pct: rule.price_uplift_pct } : {}),
      })
    }
  }

  for (const entry of data.margin_substitution_by_sku ?? []) {
    const from_sku = String(entry.sku ?? '').trim().toUpperCase()
    if (!from_sku) continue
    for (const rule of entry.alternatives ?? []) {
      const recommend = String(rule.sku ?? '').trim()
      if (!recommend) continue
      rows.push({
        rule_kind: 'margin_substitution',
        from_sku,
        ...(entry.description ? { from_description: entry.description } : {}),
        recommend,
        ...(rule.description ? { recommend_description: rule.description } : {}),
        ...(typeof rule.gp_pct_uplift_pp === 'number' ? { gp_pct_uplift_pp: rule.gp_pct_uplift_pp } : {}),
        ...(typeof rule.price_diff_pct === 'number' ? { price_diff_pct: rule.price_diff_pct } : {}),
        ...(typeof rule.invoice_count === 'number' ? { invoice_count: rule.invoice_count, co_invoices: rule.invoice_count } : {}),
      })
    }
  }

  await writeFile(outPath, JSON.stringify(rows, null, 2), 'utf8')
  const byKind: Record<string, number> = {}
  for (const r of rows) byKind[r.rule_kind] = (byKind[r.rule_kind] ?? 0) + 1
  console.log(
    JSON.stringify({
      ok: true,
      input: path.relative(root, inPath),
      output: path.relative(root, outPath),
      total: rows.length,
      by_kind: byKind,
    }),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
