import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CitationLookupTables } from './wikiCitationResolver'
import { extractCitations, resolveCitation } from './wikiCitationResolver'
import { runWikiStructuralLint } from './wikiLintAgent'

const fm = (fields: Record<string, string>) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\n`

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function writeFivePathwayWiki(repoRoot: string): Promise<void> {
  const wiki = path.join(repoRoot, 'wiki')
  await mkdir(path.join(wiki, 'sources'), { recursive: true })
  await mkdir(path.join(wiki, 'concepts/install'), { recursive: true })
  await mkdir(path.join(wiki, 'concepts/visual'), { recursive: true })
  await mkdir(path.join(wiki, 'concepts/warranty'), { recursive: true })
  await mkdir(path.join(wiki, 'entities/skus'), { recursive: true })

  const common = {
    created: '2026-05-01',
    updated: '2026-05-01',
    source_count: '2',
    related: '[]',
    tags: '[]',
    confidence: 'high',
  }

  await writeFile(
    path.join(wiki, 'WIKI.md'),
    `${fm({
      type: 'concept',
      slug: 'WIKI',
      title: 'Contract',
      ...common,
      concept_kind: 'meta',
    })}\n## Summary\nStub contract for E2E.\n`,
    'utf8',
  )

  await writeFile(
    path.join(wiki, 'index.md'),
    `${fm({
      type: 'concept',
      slug: 'index',
      title: 'Index',
      ...common,
      concept_kind: 'meta',
    })}\n## Pages\nSee [[wiki:concepts/e2e-hub]].\n`,
    'utf8',
  )

  await writeFile(
    path.join(wiki, 'log.md'),
    `${fm({
      type: 'concept',
      slug: 'log',
      title: 'Log',
      ...common,
      concept_kind: 'meta',
    })}\n# Wiki Log\n\n- 2026-05-01 event=kb.ingested source_id=e2e-mkt source_count=2\n`,
    'utf8',
  )

  await writeFile(
    path.join(wiki, 'synthesis.md'),
    `${fm({
      type: 'synthesis',
      slug: 'synthesis',
      title: 'Synthesis',
      ...common,
    })}\n## Thesis\nCross-links hub: [[wiki:concepts/e2e-hub]].\n`,
    'utf8',
  )

  await writeFile(
    path.join(wiki, 'concepts/e2e-hub.md'),
    `${fm({
      type: 'concept',
      slug: 'concepts/e2e-hub',
      title: 'E2E Hub',
      ...common,
      concept_kind: 'hub',
    })}\n## Summary\nLinks for inbound refs.\n\n## Evidence\n- Marketing [[wiki:sources/e2e-marketing]]\n- Install [[wiki:concepts/install/e2e-procedure]]\n- Visual [[wiki:concepts/visual/e2e-catalog]]\n- Structured [[wiki:entities/skus/e2e-sku]]\n- Warranty [[wiki:concepts/warranty/e2e-terms]]\n- Calls [[wiki:sources/e2e-call]]\n`,
    'utf8',
  )

  await writeFile(
    path.join(wiki, 'sources/e2e-marketing.md'),
    `${fm({
      type: 'source',
      slug: 'sources/e2e-marketing',
      title: 'Marketing one-pager',
      ...common,
      source_id: 'e2e-mkt',
      doc_kind: 'marketing-one-pager',
    })}\n## Summary\nDeck positioning per brochure [doc:mkt_doc_001].\n`,
    'utf8',
  )

  await writeFile(
    path.join(wiki, 'concepts/install/e2e-procedure.md'),
    `${fm({
      type: 'concept',
      slug: 'concepts/install/e2e-procedure',
      title: 'Install procedure',
      ...common,
      concept_kind: 'install',
    })}\n## Evidence\nFastener schedule [doc:inst_doc_001].\n`,
    'utf8',
  )

  await writeFile(
    path.join(wiki, 'concepts/visual/e2e-catalog.md'),
    `${fm({
      type: 'concept',
      slug: 'concepts/visual/e2e-catalog',
      title: 'Visual catalog',
      ...common,
      concept_kind: 'visual-catalog',
    })}\n## Evidence\nFigure reference [image:kb_extracts/e2e/img/fig1.png].\n`,
    'utf8',
  )

  await writeFile(
    path.join(wiki, 'entities/skus/e2e-sku.md'),
    `${fm({
      type: 'entity',
      slug: 'entities/skus/e2e-sku',
      title: 'E2E SKU',
      ...common,
      entity_kind: 'sku',
    })}\n## Evidence\nPricing row [catalog:sku=E2ESKU1]; rule hint [recs:cross_sell:AT-SUB#0].\n`,
    'utf8',
  )

  await writeFile(
    path.join(wiki, 'concepts/warranty/e2e-terms.md'),
    `${fm({
      type: 'concept',
      slug: 'concepts/warranty/e2e-terms',
      title: 'Warranty terms',
      ...common,
      concept_kind: 'warranty',
    })}\n## Evidence\nCoverage statement [doc:war_doc_001].\n`,
    'utf8',
  )

  await writeFile(
    path.join(wiki, 'sources/e2e-call.md'),
    `${fm({
      type: 'source',
      slug: 'sources/e2e-call',
      title: 'Call excerpt',
      ...common,
      source_id: 'e2e-call',
      doc_kind: 'call-transcript',
    })}\n## Evidence\nRep quote [call:call_e2e_001].\n`,
    'utf8',
  )
}

describe('Track B wiki layer E2E (Oz-Demo-0hu)', () => {
  it('ingests five pathway exemplars with resolvable citations and clean lint', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'track-b-wiki-e2e-'))
    roots.push(repoRoot)
    await writeFivePathwayWiki(repoRoot)

    const tables: CitationLookupTables = {
      docChunks: {
        mkt_doc_001: { chunk_id: 'mkt_doc_001' },
        inst_doc_001: { chunk_id: 'inst_doc_001' },
        war_doc_001: { chunk_id: 'war_doc_001' },
      },
      callChunks: {
        call_e2e_001: { chunk_id: 'call_e2e_001' },
      },
      images: {
        'kb_extracts/e2e/img/fig1.png': { path: 'kb_extracts/e2e/img/fig1.png' },
      },
      catalog: {
        sku: {
          E2ESKU1: { sku: 'E2ESKU1' },
        },
      },
      recommendations: {
        byRule: {
          'cross_sell:AT-SUB': [{ rule: 'x' }],
        },
      },
    }

    const samples = await readFile(path.join(repoRoot, 'wiki/sources/e2e-marketing.md'), 'utf8')
    const cites = extractCitations(samples)
    expect(cites.some((c) => c.kind === 'doc')).toBe(true)
    for (const c of cites) {
      expect(resolveCitation(c, tables).ok).toBe(true)
    }

    const lint = await runWikiStructuralLint(repoRoot, tables, new Date('2026-05-02'))
    const broken = lint.findings.filter((f) => f.kind === 'broken_citation' || f.kind === 'dead_wiki_link')
    expect(broken).toEqual([])

    const logText = await readFile(path.join(repoRoot, 'wiki/log.md'), 'utf8')
    expect(logText).toContain('source_count=2')
    expect(logText).toContain('source_id=e2e-mkt')
  })
})
