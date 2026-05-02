import { access, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

/** §14 default: assisted until enough sources exist, then autonomous (for ingest + diff). */
export const DEFAULT_AUTONOMOUS_AFTER_SOURCES = 50

export type WikiAutomationMode = 'assisted' | 'autonomous'

export type WikiAgentRole =
  | 'ingest'
  | 'diff'
  | 'linker'
  | 'index'
  | 'synthesizer'
  | 'lint'
  | 'curator'
  | 'schema'

export type WikiIngestModeSetting = 'threshold' | 'assisted' | 'autonomous'

export type WikiAutomationResolved = {
  ingest_mode: WikiIngestModeSetting
  autonomous_after_sources: number
  /** Count of `wiki/sources/*.md` pages (proxy for “sources ingested”). */
  wiki_source_page_count: number
  /** Effective modes after defaults, threshold, overrides, and §14 hard rules. */
  agents: Record<WikiAgentRole, WikiAutomationMode>
}

export const WIKI_AUTOMATION_MARKER = '# wiki-automation-config'

const ALL_ROLES: WikiAgentRole[] = [
  'ingest',
  'diff',
  'linker',
  'index',
  'synthesizer',
  'lint',
  'curator',
  'schema',
]

function isWikiAgentRole(k: string): k is WikiAgentRole {
  return (ALL_ROLES as string[]).includes(k)
}

function isMode(v: string): v is WikiAutomationMode {
  return v === 'assisted' || v === 'autonomous'
}

function isIngestModeSetting(v: string): v is WikiIngestModeSetting {
  return v === 'threshold' || v === 'assisted' || v === 'autonomous'
}

/** Extract the fenced `yaml` block that declares wiki automation (Track B §14). */
export function extractWikiAutomationYamlBlock(wikiMd: string): string | null {
  const re = /```yaml\s*\r?\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(wikiMd)) !== null) {
    if (m[1].includes(WIKI_AUTOMATION_MARKER)) return m[1]
  }
  return null
}

type ParsedYaml = {
  ingest_mode?: WikiIngestModeSetting
  autonomous_after_sources?: number
  agents: Partial<Record<WikiAgentRole, WikiAutomationMode>>
}

/**
 * Minimal YAML subset: top-level keys and an `agents:` indentation block.
 * Avoids adding a yaml dependency for this contract file.
 */
export function parseWikiAutomationYamlBlock(block: string): { parsed: ParsedYaml; warnings: string[] } {
  const warnings: string[] = []
  const parsed: ParsedYaml = { agents: {} }
  let inAgents = false
  let agentsBaseIndent = 0

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '')
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    if (trimmed.startsWith('#')) continue

    const indent = line.length - line.trimStart().length
    const kv = trimmed.match(/^([\w_]+):\s*(.*)$/)
    if (kv == null) continue
    const key = kv[1]
    const rest = kv[2].trim()

    if (key === 'agents' && rest === '') {
      inAgents = true
      agentsBaseIndent = indent
      continue
    }

    if (inAgents && indent > agentsBaseIndent) {
      if (!isWikiAgentRole(key)) {
        warnings.push(`Unknown agent role "${key}" in automation config — ignored.`)
        continue
      }
      if (!isMode(rest)) {
        warnings.push(`Invalid mode for agent "${key}": "${rest}" — ignored.`)
        continue
      }
      parsed.agents[key] = rest
      continue
    }

    inAgents = false

    if (key === 'ingest_mode') {
      if (!isIngestModeSetting(rest)) {
        warnings.push(`Invalid ingest_mode "${rest}" — falling back to threshold.`)
        parsed.ingest_mode = 'threshold'
      } else {
        parsed.ingest_mode = rest
      }
      continue
    }
    if (key === 'autonomous_after_sources') {
      const n = Number.parseInt(rest, 10)
      if (!Number.isFinite(n) || n < 0) {
        warnings.push(`Invalid autonomous_after_sources "${rest}" — using default.`)
      } else {
        parsed.autonomous_after_sources = n
      }
      continue
    }
  }

  return { parsed, warnings }
}

export async function countWikiSourcePages(repoRoot: string): Promise<number> {
  const dir = path.join(repoRoot, 'wiki', 'sources')
  let names: string[] = []
  try {
    names = await readdir(dir)
  } catch {
    return 0
  }
  return names.filter((f) => f.endsWith('.md')).length
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

/** source pages are `…-{source_id}.md` per wikiIngestAgent slug rule. */
export async function wikiSourcePageExistsForSourceId(repoRoot: string, sourceId: string): Promise<boolean> {
  const dir = path.join(repoRoot, 'wiki', 'sources')
  let names: string[] = []
  try {
    names = await readdir(dir)
  } catch {
    return false
  }
  const suffix = `-${sourceId}.md`
  return names.some((f) => f.endsWith(suffix))
}

/** kb_extracts dirs that have manifest.json but no matching wiki source page yet. */
export async function listPendingIngestSourceIds(repoRoot: string): Promise<string[]> {
  const extracts = path.join(repoRoot, 'kb_extracts')
  let names: string[] = []
  try {
    names = await readdir(extracts)
  } catch {
    return []
  }

  const pending: string[] = []
  for (const sid of names) {
    const dirPath = path.join(extracts, sid)
    try {
      if (!(await stat(dirPath)).isDirectory()) continue
    } catch {
      continue
    }
    const manifestPath = path.join(extracts, sid, 'manifest.json')
    if (!(await pathExists(manifestPath))) continue
    if (await wikiSourcePageExistsForSourceId(repoRoot, sid)) continue
    pending.push(sid)
  }
  return pending.sort()
}

function baselineAgentsFromThreshold(
  ingestMode: WikiIngestModeSetting,
  autonomousAfter: number,
  sourceCount: number,
): Pick<Record<WikiAgentRole, WikiAutomationMode>, 'ingest' | 'diff'> {
  if (ingestMode === 'assisted') {
    return { ingest: 'assisted', diff: 'assisted' }
  }
  if (ingestMode === 'autonomous') {
    return { ingest: 'autonomous', diff: 'autonomous' }
  }
  const past = sourceCount >= autonomousAfter
  const m: WikiAutomationMode = past ? 'autonomous' : 'assisted'
  return { ingest: m, diff: m }
}

/**
 * Read `wiki/WIKI.md`, parse the automation block, apply §14 defaults and hard rules
 * (Curator + Schema always assisted).
 */
export async function resolveWikiAutomationConfig(repoRoot: string): Promise<{
  resolved: WikiAutomationResolved
  warnings: string[]
}> {
  const wikiPath = path.join(repoRoot, 'wiki', 'WIKI.md')
  let wikiText = ''
  try {
    wikiText = await readFile(wikiPath, 'utf8')
  } catch {
    /* missing contract file — full defaults */
  }

  const block = extractWikiAutomationYamlBlock(wikiText)
  const warnings: string[] = []
  let raw: ParsedYaml = { agents: {} }
  if (block != null) {
    const pr = parseWikiAutomationYamlBlock(block)
    raw = pr.parsed
    warnings.push(...pr.warnings)
  }

  const ingest_mode = raw.ingest_mode ?? 'threshold'
  const autonomous_after_sources = raw.autonomous_after_sources ?? DEFAULT_AUTONOMOUS_AFTER_SOURCES
  const wiki_source_page_count = await countWikiSourcePages(repoRoot)

  const base = baselineAgentsFromThreshold(ingest_mode, autonomous_after_sources, wiki_source_page_count)

  const agents = {} as Record<WikiAgentRole, WikiAutomationMode>
  agents.ingest = raw.agents.ingest ?? base.ingest
  agents.diff = raw.agents.diff ?? base.diff
  agents.linker = raw.agents.linker ?? 'autonomous'
  agents.index = raw.agents.index ?? 'autonomous'
  agents.synthesizer = raw.agents.synthesizer ?? 'autonomous'
  agents.lint = raw.agents.lint ?? 'autonomous'
  agents.curator = raw.agents.curator ?? 'assisted'
  agents.schema = raw.agents.schema ?? 'assisted'

  agents.curator = 'assisted'
  agents.schema = 'assisted'

  return {
    resolved: {
      ingest_mode,
      autonomous_after_sources,
      wiki_source_page_count,
      agents,
    },
    warnings,
  }
}
