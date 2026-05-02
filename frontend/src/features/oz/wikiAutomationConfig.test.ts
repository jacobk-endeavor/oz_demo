import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_AUTONOMOUS_AFTER_SOURCES,
  extractWikiAutomationYamlBlock,
  parseWikiAutomationYamlBlock,
  resolveWikiAutomationConfig,
  WIKI_AUTOMATION_MARKER,
} from './wikiAutomationConfig'

describe('wikiAutomationConfig', () => {
  const tmpDirs: string[] = []
  afterEach(async () => {
    for (const d of tmpDirs) {
      await rm(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  async function makeRepo(layout: { wikiMd?: string; sources?: string[]; extracts?: string[] }): Promise<string> {
    const repo = path.join(os.tmpdir(), `wiki-auto-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    tmpDirs.push(repo)

    const wikiDir = path.join(repo, 'wiki')
    await mkdir(path.join(wikiDir, 'sources'), { recursive: true })
    await writeFile(
      path.join(wikiDir, 'WIKI.md'),
      layout.wikiMd ??
        `# WIKI\n\n\`\`\`yaml\n${WIKI_AUTOMATION_MARKER}\ningest_mode: threshold\nautonomous_after_sources: 50\nagents:\n  linker: autonomous\n\`\`\`\n`,
      'utf8',
    )
    for (const f of layout.sources ?? []) {
      await writeFile(path.join(wikiDir, 'sources', f), '---\ntype: source\n---\n', 'utf8')
    }
    await mkdir(path.join(repo, 'kb_extracts'), { recursive: true })
    for (const sid of layout.extracts ?? []) {
      const d = path.join(repo, 'kb_extracts', sid)
      await mkdir(d, { recursive: true })
      await writeFile(path.join(d, 'manifest.json'), '{"stub":true}', 'utf8')
    }
    return repo
  }

  it('extracts and parses the automation yaml block', () => {
    const md = `# x\n\n\`\`\`yaml\n${WIKI_AUTOMATION_MARKER}\ningest_mode: assisted\nautonomous_after_sources: 12\nagents:\n  linker: autonomous\n  lint: autonomous\n\`\`\`\n`
    const block = extractWikiAutomationYamlBlock(md)
    expect(block).toContain(WIKI_AUTOMATION_MARKER)
    const { parsed, warnings } = parseWikiAutomationYamlBlock(block!)
    expect(warnings.length).toBe(0)
    expect(parsed.ingest_mode).toBe('assisted')
    expect(parsed.autonomous_after_sources).toBe(12)
    expect(parsed.agents.linker).toBe('autonomous')
  })

  it('defaults threshold ingest/diff from source count', async () => {
    const repo = await makeRepo({
      wikiMd: `# c\n\n\`\`\`yaml\n${WIKI_AUTOMATION_MARKER}\ningest_mode: threshold\nautonomous_after_sources: 3\n\`\`\`\n`,
      sources: ['a-x.md', 'b-y.md'],
      extracts: [],
    })
    const { resolved } = await resolveWikiAutomationConfig(repo)
    expect(resolved.wiki_source_page_count).toBe(2)
    expect(resolved.agents.ingest).toBe('assisted')
    expect(resolved.agents.diff).toBe('assisted')
  })

  it('flips ingest/diff to autonomous after threshold', async () => {
    const repo = await makeRepo({
      wikiMd: `# c\n\n\`\`\`yaml\n${WIKI_AUTOMATION_MARKER}\ningest_mode: threshold\nautonomous_after_sources: 2\n\`\`\`\n`,
      sources: ['a.md', 'b.md'],
      extracts: [],
    })
    const { resolved } = await resolveWikiAutomationConfig(repo)
    expect(resolved.agents.ingest).toBe('autonomous')
    expect(resolved.agents.diff).toBe('autonomous')
  })

  it('forces curator and schema assisted', async () => {
    const repo = await makeRepo({
      wikiMd: `# c\n\n\`\`\`yaml\n${WIKI_AUTOMATION_MARKER}\ningest_mode: autonomous\nagents:\n  curator: autonomous\n  schema: autonomous\n\`\`\`\n`,
      extracts: [],
    })
    const { resolved } = await resolveWikiAutomationConfig(repo)
    expect(resolved.agents.curator).toBe('assisted')
    expect(resolved.agents.schema).toBe('assisted')
  })

  it('uses default autonomous_after_sources constant when omitted', async () => {
    const md = `# c\n\n\`\`\`yaml\n${WIKI_AUTOMATION_MARKER}\ningest_mode: threshold\n\`\`\`\n`
    const repo = await makeRepo({ wikiMd: md, extracts: [] })
    const { resolved } = await resolveWikiAutomationConfig(repo)
    expect(resolved.autonomous_after_sources).toBe(DEFAULT_AUTONOMOUS_AFTER_SOURCES)
  })
})
