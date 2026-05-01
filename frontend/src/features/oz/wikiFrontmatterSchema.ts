import { readdir } from 'node:fs/promises'
import path from 'node:path'

export const REQUIRED_FRONTMATTER = [
  'type',
  'slug',
  'title',
  'created',
  'updated',
  'source_count',
  'related',
  'tags',
  'confidence',
] as const

/** Keys recognized by WIKI.md / Track B — anything else appearing ≥5 times is reported for Schema review (Lint). */
export const FRONTMATTER_KEY_ALLOWLIST = new Set<string>([
  ...REQUIRED_FRONTMATTER,
  'entity_kind',
  'concept_kind',
  'source_id',
  'doc_kind',
  'brand',
  'product_line',
  'year',
  'distributor_branded',
  'product_line_code',
  'sub_categories',
  'sku_count',
  'total_sales_year',
  'catalog_refresh',
  'merged_from',
  'methodology_version',
  'supersedes',
])

export function parseFrontmatter(markdown: string): Record<string, string> {
  if (!markdown.startsWith('---\n')) return {}
  const end = markdown.indexOf('\n---\n', 4)
  if (end < 0) return {}
  const out: Record<string, string> = {}
  for (const line of markdown.slice(4, end).split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"|"$/g, '')
  }
  return out
}

export async function listWikiMarkdownFiles(wikiRoot: string): Promise<string[]> {
  async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) files.push(...(await walk(absolute)))
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute)
    }
    return files
  }
  return walk(wikiRoot)
}
