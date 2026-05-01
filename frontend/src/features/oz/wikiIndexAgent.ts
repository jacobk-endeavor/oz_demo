import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

type IndexKind = 'entities' | 'concepts' | 'sources' | 'synthesis'

type FrontmatterRecord = {
  title: string
  slug: string
  updated: string
  source_count: number
  kind: IndexKind
}

export type RebuildWikiIndexResult = {
  indexPath: string
  split: boolean
  filesWritten: string[]
}

const SPLIT_THRESHOLD_LINES = 500

function parseFrontmatter(markdown: string): Record<string, string> {
  if (!markdown.startsWith('---\n')) return {}
  const end = markdown.indexOf('\n---\n', 4)
  if (end < 0) return {}
  const lines = markdown.slice(4, end).split('\n')
  const out: Record<string, string> = {}
  for (const line of lines) {
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^"|"$/g, '')
    out[key] = value
  }
  return out
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath)
  }
  return files
}

function inferKind(relativePath: string): IndexKind | null {
  if (relativePath.startsWith('entities/')) return 'entities'
  if (relativePath.startsWith('concepts/')) return 'concepts'
  if (relativePath.startsWith('sources/')) return 'sources'
  if (relativePath === 'synthesis.md') return 'synthesis'
  return null
}

function recordFromFrontmatter(fm: Record<string, string>, kind: IndexKind): FrontmatterRecord | null {
  if (fm.slug == null || fm.title == null) return null
  const sourceCount = Number.parseInt(fm.source_count ?? '0', 10)
  return {
    title: fm.title,
    slug: fm.slug,
    updated: fm.updated ?? '1970-01-01',
    source_count: Number.isInteger(sourceCount) ? sourceCount : 0,
    kind,
  }
}

function toSection(title: string, records: FrontmatterRecord[]): string {
  const lines = [`## ${title}`]
  for (const record of records) {
    lines.push(`- [[${record.slug}]] - ${record.title} - ${record.source_count} sources - updated ${record.updated}`)
  }
  if (records.length === 0) lines.push('- none')
  return `${lines.join('\n')}\n`
}

function sortByUpdatedDesc(records: FrontmatterRecord[]): FrontmatterRecord[] {
  return [...records].sort((left, right) => right.updated.localeCompare(left.updated))
}

export async function rebuildWikiIndex(repoRoot: string): Promise<RebuildWikiIndexResult> {
  const wikiRoot = path.join(repoRoot, 'wiki')
  const markdownFiles = await listMarkdownFiles(wikiRoot)
  const records: FrontmatterRecord[] = []

  for (const absolutePath of markdownFiles) {
    const relativePath = path.relative(wikiRoot, absolutePath).replaceAll('\\', '/')
    if (relativePath === 'index.md' || relativePath.startsWith('index/')) continue
    const kind = inferKind(relativePath)
    if (kind == null) continue
    const content = await readFile(absolutePath, 'utf8')
    const parsed = parseFrontmatter(content)
    const record = recordFromFrontmatter(parsed, kind)
    if (record != null) records.push(record)
  }

  const entities = sortByUpdatedDesc(records.filter((record) => record.kind === 'entities'))
  const concepts = sortByUpdatedDesc(records.filter((record) => record.kind === 'concepts'))
  const sources = sortByUpdatedDesc(records.filter((record) => record.kind === 'sources'))
  const synthesis = sortByUpdatedDesc(records.filter((record) => record.kind === 'synthesis'))
  const sections = [
    toSection('Entities', entities),
    toSection('Concepts', concepts),
    toSection('Sources', sources),
    toSection('Synthesis', synthesis),
  ]
  const fullIndex = ['# Wiki Index', '', ...sections].join('\n')
  const filesWritten: string[] = []

  const indexPath = path.join(wikiRoot, 'index.md')
  if (fullIndex.split('\n').length <= SPLIT_THRESHOLD_LINES) {
    await writeFile(indexPath, `${fullIndex}\n`, 'utf8')
    filesWritten.push(indexPath)
    return { indexPath, split: false, filesWritten }
  }

  const indexDir = path.join(wikiRoot, 'index')
  await mkdir(indexDir, { recursive: true })
  const entitiesPath = path.join(indexDir, 'entities.md')
  const conceptsPath = path.join(indexDir, 'concepts.md')
  const sourcesPath = path.join(indexDir, 'sources.md')
  await writeFile(entitiesPath, `# Entities Index\n\n${toSection('Entities', entities)}`, 'utf8')
  await writeFile(conceptsPath, `# Concepts Index\n\n${toSection('Concepts', concepts)}`, 'utf8')
  await writeFile(sourcesPath, `# Sources Index\n\n${toSection('Sources', sources)}`, 'utf8')
  await writeFile(
    indexPath,
    `# Wiki Index\n\n- [[wiki:index/entities]]\n- [[wiki:index/concepts]]\n- [[wiki:index/sources]]\n`,
    'utf8',
  )
  filesWritten.push(indexPath, entitiesPath, conceptsPath, sourcesPath)
  return { indexPath, split: true, filesWritten }
}
