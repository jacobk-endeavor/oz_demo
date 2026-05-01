import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { extractCitations, resolveCitation, type CitationLookupTables } from './wikiCitationResolver'

type LintFinding = {
  kind: 'broken_citation' | 'dead_wiki_link' | 'schema_violation' | 'orphan_page'
  page: string
  detail: string
}

export type RunWikiStructuralLintResult = {
  reportPath: string
  findings: LintFinding[]
}

const REQUIRED_FRONTMATTER = ['type', 'slug', 'title', 'created', 'updated', 'source_count', 'related', 'tags', 'confidence']

function parseFrontmatter(markdown: string): Record<string, string> {
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

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await listMarkdownFiles(absolute)))
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute)
  }
  return files
}

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
  const files = await listMarkdownFiles(wikiRoot)
  const findings: LintFinding[] = []
  const inboundRefs = new Map<string, number>()
  const pageSlugs = new Set<string>()
  const pageBySlug = new Map<string, string>()

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
    for (const key of REQUIRED_FRONTMATTER) {
      if (frontmatter[key] == null || frontmatter[key].length === 0) {
        findings.push({ kind: 'schema_violation', page: rel, detail: `missing frontmatter key: ${key}` })
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
  ].join('\n')
  await writeFile(reportPath, `${report}\n`, 'utf8')
  return { reportPath, findings }
}
