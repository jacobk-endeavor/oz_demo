import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runIngestAgentScaffold } from './wikiIngestAgent'
import {
  buildDetectedEntitiesSection,
  buildVisualCatalogHighlights,
  buildWarrantyHighlights,
  deriveTags,
  detectEntityMentions,
} from './wikiIngestDense'
import type { ExtractManifest } from './extractArtifact'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })))
})

const baseManifest: ExtractManifest = {
  manifest_version: 1,
  source_id: 'src000',
  title: 'Doc',
  doc_kind: 'warranty',
  has_full_text: true,
  units: [],
}

describe('detectEntityMentions', () => {
  it('finds brands and product lines from text plus manifest', () => {
    const text = `This Deckorators Voyage decking comparison vs AZEK Prime+ and Fiberon Sanctuary. Email warranty@ufpi.com or call 608-208-9462.`
    const out = detectEntityMentions(text, { ...baseManifest, brand: 'Deckorators', product_line: 'Voyage' })
    expect(out.brands).toContain('Deckorators')
    expect(out.brands).toContain('AZEK')
    expect(out.brands).toContain('Fiberon')
    expect(out.productLines).toContain('Voyage')
    expect(out.productLines).toContain('Prime+')
    expect(out.productLines).toContain('Sanctuary')
    expect(out.emails).toContain('warranty@ufpi.com')
    expect(out.phones.some((p) => p.replace(/\D/g, '') === '6082089462')).toBe(true)
  })

  it('preserves manifest brand when no other brand is detected', () => {
    const out = detectEntityMentions('plain text', { ...baseManifest, brand: 'Russin' })
    expect(out.brands).toEqual(['Russin'])
  })
})

describe('buildWarrantyHighlights', () => {
  it('extracts numbered procedure steps and contact lines', () => {
    const text = [
      '038 Warranty Services Checklist',
      '1. Confirm the product is from UFP Industries.',
      '2. Obtain a completed Case Information Form.',
      'A. A claim can only be reviewed once info is received.',
      'Milan Matheson, Warranty Services Manager, 608-208-9462, mmatheson@ufpi.com',
    ].join('\n')
    const md = buildWarrantyHighlights(text)
    expect(md).toContain('### Procedure (verbatim)')
    expect(md).toContain('1. Confirm the product is from UFP Industries.')
    expect(md).toContain('2. Obtain a completed Case Information Form.')
    expect(md).toContain('### Notes (verbatim)')
    expect(md).toContain('A. A claim can only be reviewed once info is received.')
    expect(md).toContain('### Contacts')
    expect(md).toContain('mmatheson@ufpi.com')
  })

  it('returns empty string when nothing matches', () => {
    expect(buildWarrantyHighlights('lorem ipsum dolor sit amet')).toBe('')
  })
})

describe('buildVisualCatalogHighlights', () => {
  it('pairs CAPS color names with their Compare-to targets', () => {
    const text = `VENTURE DECKING\nCompare to:\nAzek Prime+ Collection Sea Salt Gray\nSANDBAR\nCompare to:\nAzek Reserve Collection Driftwood`
    const md = buildVisualCatalogHighlights(text)
    expect(md).toContain('## Color Equivalence Pairs')
    expect(md).toContain('**VENTURE DECKING** → Azek Prime+ Collection Sea Salt Gray')
    expect(md).toContain('**SANDBAR** → Azek Reserve Collection Driftwood')
  })
})

describe('buildDetectedEntitiesSection', () => {
  it('omits empty sections', () => {
    expect(buildDetectedEntitiesSection({ brands: [], productLines: [], emails: [], phones: [] })).toBe('')
  })

  it('renders bold labels for non-empty fields', () => {
    const md = buildDetectedEntitiesSection({
      brands: ['Deckorators'],
      productLines: ['Voyage'],
      emails: ['x@y.com'],
      phones: ['555-555-5555'],
    })
    expect(md).toContain('**Brands:** Deckorators')
    expect(md).toContain('**Product lines:** Voyage')
    expect(md).toContain('**Emails:** x@y.com')
    expect(md).toContain('**Phones:** 555-555-5555')
  })
})

describe('deriveTags', () => {
  it('slugifies brand and product line and includes year', () => {
    const tags = deriveTags(
      { ...baseManifest, doc_kind: 'visual-catalog', brand: 'AZEK', product_line: 'Prime+', year: 2023 },
      { brands: ['AZEK', 'Deckorators'], productLines: ['Prime+', 'Voyage'], emails: [], phones: [] },
    )
    expect(tags).toContain('visual-catalog')
    expect(tags).toContain('azek')
    expect(tags).toContain('deckorators')
    expect(tags).toContain('prime')
    expect(tags).toContain('voyage')
    expect(tags).toContain('2023')
  })
})

describe('runIngestAgentScaffold density integration', () => {
  it('embeds extracted excerpts, detected entities, and tags into the source page', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'wiki-ingest-dense-'))
    tempRoots.push(repoRoot)
    await mkdir(path.join(repoRoot, 'wiki', 'sources'), { recursive: true })
    await writeFile(path.join(repoRoot, 'wiki', 'log.md'), '# Wiki Log\n', 'utf8')
    await mkdir(path.join(repoRoot, 'kb_extracts', 'src111'), { recursive: true })
    await writeFile(
      path.join(repoRoot, 'kb_extracts', 'src111', 'unit-page-001.txt'),
      [
        '038 Warranty Services Checklist',
        '1. Confirm the product is from UFP Industries.',
        '2. Obtain a completed Case Information Form.',
        'Milan Matheson, Warranty Services Manager, 608-208-9462, mmatheson@ufpi.com',
        'For Deckorators Voyage decking, follow this procedure.',
      ].join('\n'),
      'utf8',
    )
    await writeFile(
      path.join(repoRoot, 'kb_extracts', 'src111', 'manifest.json'),
      JSON.stringify(
        {
          manifest_version: 1,
          source_id: 'src111',
          title: 'Warranty Services Checklist',
          doc_kind: 'warranty',
          brand: 'Deckorators',
          product_line: 'Voyage',
          year: 2021,
          has_full_text: false,
          units: [
            {
              locator: 'page=1',
              file: 'unit-page-001.txt',
              chunk_ids: ['src111_p001_00000'],
              content_hash: 'h',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    )

    const result = await runIngestAgentScaffold({
      repoRoot,
      now: new Date('2026-05-01T12:00:00.000Z'),
      event: { event_version: 1, event: 'kb.ingested', source_id: 'src111' },
    })
    const md = await readFile(result.sourcePagePath, 'utf8')

    expect(md).toContain('## Detected Entities')
    expect(md).toContain('**Brands:** Deckorators')
    expect(md).toContain('Voyage')
    expect(md).toContain('## Warranty Highlights')
    expect(md).toContain('### Procedure (verbatim)')
    expect(md).toContain('mmatheson@ufpi.com')
    expect(md).toContain('## Extracted Excerpts')
    expect(md).toContain('> 038 Warranty Services Checklist')
    expect(md).toContain('[doc:src111_p001_00000]')
    expect(md).toMatch(/tags:\s*\[[^\]]*"warranty"[^\]]*"deckorators"/)
  })
})
