import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FRONTMATTER_KEY_ALLOWLIST, listWikiMarkdownFiles, parseFrontmatter } from './wikiFrontmatterSchema'

/** Matches Lint: keys appearing this often without allowlist membership are frequent drift. */
export const FREQUENT_NOVEL_KEY_THRESHOLD = 5

export type WikiSchemaNovelKeyStat = {
  key: string
  pageCount: number
}

export type RunWikiSchemaReviewResult = {
  reportPath: string
  novelKeys: WikiSchemaNovelKeyStat[]
  frequentNovelKeys: WikiSchemaNovelKeyStat[]
}

function reportStamp(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Track B Schema Agent (scaffold): deterministic frontmatter drift report for quarterly / on-demand review.
 * Human or LLM runs later against this output to update `wiki/WIKI.md` and the code allowlist.
 */
export async function runWikiSchemaReview(
  repoRoot: string,
  now = new Date(),
): Promise<RunWikiSchemaReviewResult> {
  const wikiRoot = path.join(repoRoot, 'wiki')
  const files = await listWikiMarkdownFiles(wikiRoot)
  const frontmatterKeyHits = new Map<string, number>()

  for (const file of files) {
    const rel = path.relative(wikiRoot, file).replaceAll('\\', '/')
    if (rel.startsWith('_lint/')) continue
    const markdown = await readFile(file, 'utf8')
    const frontmatter = parseFrontmatter(markdown)
    for (const key of Object.keys(frontmatter)) {
      frontmatterKeyHits.set(key, (frontmatterKeyHits.get(key) ?? 0) + 1)
    }
  }

  const novelKeys: WikiSchemaNovelKeyStat[] = []
  for (const [key, pageCount] of frontmatterKeyHits.entries()) {
    if (!FRONTMATTER_KEY_ALLOWLIST.has(key)) {
      novelKeys.push({ key, pageCount })
    }
  }
  novelKeys.sort((a, b) => b.pageCount - a.pageCount || a.key.localeCompare(b.key))

  const frequentNovelKeys = novelKeys.filter((row) => row.pageCount >= FREQUENT_NOVEL_KEY_THRESHOLD)

  const lintDir = path.join(wikiRoot, '_lint')
  await mkdir(lintDir, { recursive: true })
  const reportPath = path.join(lintDir, `${reportStamp(now)}-schema-review.md`)

  const lines = [
    '# Wiki Schema Review (Track B scaffold)',
    '',
    `Generated: ${now.toISOString()}`,
    '',
    'This report lists frontmatter keys found in committed wiki pages that are not in the code allowlist (`wikiFrontmatterSchema.ts`), plus keys that exceed the Lint drift threshold (≥5 pages). Use it to drive updates to `wiki/WIKI.md` and the allowlist.',
    '',
    `## Frequent novel keys (≥${FREQUENT_NOVEL_KEY_THRESHOLD} pages — Lint parity)`,
    frequentNovelKeys.length === 0 ? '- none\n' : frequentNovelKeys.map((r) => `- \`${r.key}\`: ${r.pageCount} pages`).join('\n'),
    '',
    '## All novel keys',
    novelKeys.length === 0 ? '- none\n' : novelKeys.map((r) => `- \`${r.key}\`: ${r.pageCount} pages`).join('\n'),
    '',
  ]
  await writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8')

  return { reportPath, novelKeys, frequentNovelKeys }
}
