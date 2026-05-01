import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { extractCitations, resolveCitation, type CitationLookupTables } from './wikiCitationResolver'
import {
  FRONTMATTER_KEY_ALLOWLIST,
  listWikiMarkdownFiles,
  parseFrontmatter,
  REQUIRED_FRONTMATTER,
} from './wikiFrontmatterSchema'

type LintFinding = {
  kind:
    | 'broken_citation'
    | 'dead_wiki_link'
    | 'schema_violation'
    | 'orphan_page'
    | 'stub_debt'
    | 'novel_frontmatter_key'
  page: string
  detail: string
}

export type RunWikiStructuralLintResult = {
  reportPath: string
  findings: LintFinding[]
}

const STUB_DEBT_DAYS = 56

function reportStamp(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function asWikiSlug(relativePath: string): string {
  return relativePath.replace(/\.md$/, '').replaceAll('\\', '/')
}

export async function runWikiStructuralLint(
  repoRoot: string,
  tables: CitationLookupTables = {},
  now = new Date(),
): Promise<RunWikiStructuralLintResult> {
  const wikiRoot = path.join(repoRoot, 'wiki')
  const files = await listWikiMarkdownFiles(wikiRoot)
  const findings: LintFinding[] = []
  const inboundRefs = new Map<string, number>()
  const pageSlugs = new Set<string>()
  const pageBySlug = new Map<string, string>()
  const frontmatterKeyHits = new Map<string, number>()

  for (const file of files) {
    const rel = path.relative(wikiRoot, file).replaceAll('\\', '/')
    if (rel.startsWith('_lint/')) continue
    const slug = asWikiSlug(rel)
    pageSlugs.add(slug)
    pageBySlug.set(slug, rel)
  }

  tables.wikiPages = {
    ...(tables.wikiPages ?? {}),
    ...Object.fromEntries([...pageSlugs].map((slug) => [slug, { slug, status: 'ready' }])),
  }

  for (const file of files) {
    const rel = path.relative(wikiRoot, file).replaceAll('\\', '/')
    if (rel.startsWith('_lint/')) continue
    const markdown = await readFile(file, 'utf8')
    const frontmatter = parseFrontmatter(markdown)
    for (const key of Object.keys(frontmatter)) {
      frontmatterKeyHits.set(key, (frontmatterKeyHits.get(key) ?? 0) + 1)
    }
    for (const key of REQUIRED_FRONTMATTER) {
      if (frontmatter[key] == null || frontmatter[key].length === 0) {
        findings.push({ kind: 'schema_violation', page: rel, detail: `missing frontmatter key: ${key}` })
      }
    }

    const updatedRaw = frontmatter.updated
    const sourceCountRaw = frontmatter.source_count
    if (updatedRaw != null && sourceCountRaw != null) {
      const updatedAt = new Date(updatedRaw)
      const sourceCount = Number.parseInt(sourceCountRaw, 10)
      if (
        Number.isFinite(sourceCount) &&
        sourceCount <= 1 &&
        !Number.isNaN(updatedAt.getTime()) &&
        (now.getTime() - updatedAt.getTime()) / 86400000 >= STUB_DEBT_DAYS
      ) {
        findings.push({
          kind: 'stub_debt',
          page: rel,
          detail: `source_count=${sourceCount} after ${STUB_DEBT_DAYS}+ days since ${updatedRaw} — enrich or archive`,
        })
      }
    }

    for (const citation of extractCitations(markdown)) {
      const resolved = resolveCitation(citation, tables)
      if (!resolved.ok) {
        const kind = citation.kind === 'wiki' ? 'dead_wiki_link' : 'broken_citation'
        findings.push({ kind, page: rel, detail: `${citation.raw} => ${resolved.reason}` })
      }
      if (citation.kind === 'wiki') {
        const target = citation.slug
        inboundRefs.set(target, (inboundRefs.get(target) ?? 0) + 1)
      }
    }
  }

  for (const slug of pageSlugs) {
    if (slug === 'index' || slug === 'log' || slug === 'WIKI' || slug === 'synthesis') continue
    if ((inboundRefs.get(slug) ?? 0) > 0) continue
    const page = pageBySlug.get(slug)
    if (page != null) findings.push({ kind: 'orphan_page', page, detail: 'no inbound wiki links' })
  }

  for (const [key, hits] of frontmatterKeyHits.entries()) {
    if (hits >= 5 && !FRONTMATTER_KEY_ALLOWLIST.has(key)) {
      findings.push({
        kind: 'novel_frontmatter_key',
        page: '(aggregate)',
        detail: `frontmatter key "${key}" appears on ${hits} pages but is not listed in WIKI.md allowlist`,
      })
    }
  }

  const lintDir = path.join(wikiRoot, '_lint')
  await mkdir(lintDir, { recursive: true })
  const reportPath = path.join(lintDir, `${reportStamp(now)}-report.md`)
  const grouped = new Map<LintFinding['kind'], LintFinding[]>()
  for (const finding of findings) {
    const existing = grouped.get(finding.kind) ?? []
    existing.push(finding)
    grouped.set(finding.kind, existing)
  }
  const section = (kind: LintFinding['kind'], title: string) => {
    const rows = grouped.get(kind) ?? []
    if (rows.length === 0) return `## ${title}\n- none\n`
    return `## ${title}\n${rows.map((row) => `- ${row.page}: ${row.detail}`).join('\n')}\n`
  }
  const report = [
    '# Wiki Structural Lint Report',
    '',
    section('broken_citation', 'Broken citations'),
    section('dead_wiki_link', 'Dead wiki links'),
    section('schema_violation', 'Schema violations'),
    section('orphan_page', 'Orphan pages'),
    section('stub_debt', 'Stub debt / low evidence (drift)'),
    section('novel_frontmatter_key', 'Novel frontmatter keys (drift)'),
  ].join('\n')
  await writeFile(reportPath, `${report}\n`, 'utf8')
  return { reportPath, findings }
}
