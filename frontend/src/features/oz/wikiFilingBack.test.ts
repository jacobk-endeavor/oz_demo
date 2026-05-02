import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackCToolScaffold } from '../../../../backend/oz/trackCToolScaffold'
import {
  appendSkippedFilingQueryEvent,
  collectDistinctEvidenceSources,
  evaluateFilingNovelty,
  FILING_CONCEPT_SIMILARITY_THRESHOLD,
  isGeneralizableQuestion,
  MIN_FILING_EVIDENCE_SOURCES,
  runFilingCuratorAgent,
  WIKI_LOOKUP_COVER_SCORE,
} from '../../../../backend/oz/wikiFilingBack'

describe('wikiFilingBack', () => {
  const prevRepo = process.env.OZ_REPO_ROOT
  const prevWiki = process.env.OZ_WIKI_ROOT_PATH

  afterEach(() => {
    process.env.OZ_REPO_ROOT = prevRepo
    process.env.OZ_WIKI_ROOT_PATH = prevWiki
  })

  it('counts ≥3 distinct evidence sources from kb + transcript + citations', () => {
    const answer = 'See [doc:abc12_p1_0] and [catalog:sku=DK35031021].'
    const { count, keys } = collectDistinctEvidenceSources(answer, {
      kbHits: [
        {
          chunk_id: 'k1',
          content: '',
          source_id: 's2',
          locator: '',
          score: 0.5,
          surface: 'kb',
        },
        {
          chunk_id: 'k2',
          content: '',
          source_id: 's3',
          locator: '',
          score: 0.5,
          surface: 'kb',
        },
      ],
      transcriptHits: [{ call_id: 'call_z' }],
    })
    expect(count).toBeGreaterThanOrEqual(MIN_FILING_EVIDENCE_SOURCES)
    expect(keys.has('doc:abc12')).toBe(true)
    expect(keys.has('catalog:sku:DK35031021')).toBe(true)
    expect(keys.has('doc:s2')).toBe(true)
    expect(keys.has('doc:s3')).toBe(true)
    expect(keys.has('call:call_z')).toBe(true)
  })

  it('flags non-generalizable transcript-centric questions', () => {
    expect(isGeneralizableQuestion('What did the customer say in that call about pricing?')).toBe(false)
    expect(isGeneralizableQuestion('How do contractor objections about lead times typically cluster?')).toBe(true)
  })

  it('suppresses filing when a concepts page strongly matches wiki_lookup', async () => {
    const result = await evaluateFilingNovelty({
      userQuestion: 'composite decking thermal expansion tolerances',
      assistantAnswer: '[doc:a_p1_0] [doc:b_p1_0] [doc:c_p1_0]',
      scaffold: {
        async wiki_lookup() {
          return {
            query: 'x',
            pages: [
              {
                path: 'concepts/install/expansion-gaps.md',
                score: WIKI_LOOKUP_COVER_SCORE + 5,
                content: 'thermal movement',
                citation: '[wiki:concepts/install/expansion-gaps.md]',
              },
            ],
          }
        },
      },
      evidence: {
        kbHits: [
          { chunk_id: '1', content: '', source_id: 'x', locator: '', score: 1, surface: 'kb' },
          { chunk_id: '2', content: '', source_id: 'y', locator: '', score: 1, surface: 'kb' },
          { chunk_id: '3', content: '', source_id: 'z', locator: '', score: 1, surface: 'kb' },
        ],
      },
    })
    expect(result.offer_filing).toBe(false)
    expect(result.reasons.some((r) => r.includes('wiki_lookup_covers'))).toBe(true)
  })

  it('appendSkippedFilingQueryEvent appends a query block to wiki/log.md', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'oz-filing-'))
    await mkdir(path.join(root, 'wiki'), { recursive: true })
    await writeFile(path.join(root, 'wiki', 'log.md'), '# Wiki Log\n')
    await appendSkippedFilingQueryEvent(root, {
      question: 'test question?',
      reasons: ['insufficient_distinct_sources_1_need_3'],
      distinct_source_count: 1,
      citations_compact: '[doc:x]',
      trace_id: 'tr1',
    })
    const log = await readFile(path.join(root, 'wiki', 'log.md'), 'utf8')
    expect(log).toContain('track_c.filing_skipped')
    expect(log).toContain('test question?')
    expect(log).toContain('trace=tr1')
  })

  it('runFilingCuratorAgent suggests merge when candidate matches an existing concept', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'oz-curator-'))
    process.env.OZ_REPO_ROOT = root
    const wikiDir = path.join(root, 'wiki')
    process.env.OZ_WIKI_ROOT_PATH = wikiDir
    await mkdir(path.join(wikiDir, 'concepts', 'topics'), { recursive: true })
    const dupBody =
      'Thermal expansion of composite decking boards requires gapping at butt joints per manufacturer tables.'
    await writeFile(
      path.join(wikiDir, 'concepts', 'topics', 'expansion.md'),
      `---\ntitle: Expansion\n---\n\n${dupBody}\n`,
    )

    const scaffold = new TrackCToolScaffold({ readEnv: () => ({ ...process.env } as Record<string, string>) })
    await scaffold.initialize()

    const candidate =
      'Thermal expansion of composite decking boards requires gapping at butt joints per manufacturer guidance.'
    const out = await runFilingCuratorAgent({
      repoRoot: scaffold.getRepoRoot(),
      candidateBody: candidate,
      suggestedSlug: 'new-expansion',
      title: 'Expansion note',
      nowIsoDate: '2026-05-01',
      write: false,
    })
    expect(out.action).toBe('merge_suggestion')
    if (out.action === 'merge_suggestion') {
      expect(out.similarity).toBeGreaterThanOrEqual(FILING_CONCEPT_SIMILARITY_THRESHOLD)
      expect(out.target_relative_path).toContain('concepts/')
    }
  })
})
