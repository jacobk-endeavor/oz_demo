import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildExtractManifest,
  buildPptxExtractUnits,
  shouldEmitFullText,
  writeExtractArtifact,
  writePptxExtractArtifact,
} from './extractArtifact'

const cleanupDirs: string[] = []

afterEach(async () => {
  for (const dir of cleanupDirs.splice(0, cleanupDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe('buildExtractManifest', () => {
  it('builds deterministic manifest with sorted chunk ids and content hashes', () => {
    const manifest = buildExtractManifest({
      repoRoot: '/tmp/ignored',
      sourceId: 'ABCDEF123456',
      title: 'Deck Guide',
      docKind: 'tech-bulletin',
      brand: 'Deckorators',
      productLine: 'Voyage',
      year: 2026,
      distributorBranded: false,
      units: [
        {
          locator: 'page=1',
          fileName: 'unit-page-001.txt',
          body: 'alpha body',
          chunkIds: ['abc_p001_00002', 'abc_p001_00001', 'abc_p001_00001'],
          images: ['img/page-001-fig-01.png'],
        },
      ],
    })

    expect(manifest.manifest_version).toBe(1)
    expect(manifest.source_id).toBe('abcdef123456')
    expect(manifest.has_full_text).toBe(true)
    expect(manifest.full_text_file).toBe('full.txt')
    expect(manifest.units[0]?.chunk_ids).toEqual(['abc_p001_00001', 'abc_p001_00002'])
    expect(manifest.units[0]?.content_hash).toBe('8be52585779d628b1925d0b8494cc568aa1be5f51542f07862c6a0e9a9b60b80')
  })

  it('rejects unsafe paths', () => {
    expect(() =>
      buildExtractManifest({
        repoRoot: '/tmp/ignored',
        sourceId: 'abcdef123456',
        title: 'Unsafe',
        docKind: 'marketing',
        units: [{ locator: 'page=1', fileName: '../escape.txt', body: 'x', chunkIds: ['c1'] }],
      }),
    ).toThrow('artifact file path must not contain dot segments')
  })
})

describe('writeExtractArtifact', () => {
  it('writes to staging and atomically renames to kb_extracts/<source_id>', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'extract-artifact-'))
    cleanupDirs.push(repoRoot)

    const { outputDir, manifest } = await writeExtractArtifact({
      repoRoot,
      sourceId: 'abcdef123456',
      title: 'Warranty Doc',
      docKind: 'warranty',
      units: [
        {
          locator: 'page=1',
          fileName: 'unit-page-001.txt',
          body: 'page one',
          chunkIds: ['abc_p001_00000'],
          images: ['img/page-001-fig-01.png'],
        },
        {
          locator: 'page=2',
          fileName: 'unit-page-002.txt',
          body: 'page two',
          chunkIds: ['abc_p002_00000'],
        },
      ],
    })

    expect(outputDir).toBe(path.join(repoRoot, 'kb_extracts', 'abcdef123456'))
    expect(await stat(path.join(outputDir, 'manifest.json'))).toBeDefined()
    expect(await stat(path.join(outputDir, 'full.txt'))).toBeDefined()
    expect(await stat(path.join(outputDir, 'unit-page-001.txt'))).toBeDefined()
    expect(await stat(path.join(outputDir, 'img', 'page-001-fig-01.png'))).toBeDefined()
    await expect(stat(path.join(repoRoot, 'kb_extracts', '.staging', 'abcdef123456'))).rejects.toThrow()

    const manifestText = await readFile(path.join(outputDir, 'manifest.json'), 'utf8')
    expect(JSON.parse(manifestText)).toEqual(manifest)
  })
})

describe('buildPptxExtractUnits', () => {
  it('orders slides and concatenates title/body/notes with slide header', () => {
    const units = buildPptxExtractUnits('Deck Demo', [
      {
        slideNumber: 2,
        chunkIds: ['s2_a'],
        title: 'Slide 2 title',
        bodyText: ['Slide 2 body line 1', 'Slide 2 body line 2'],
        speakerNotes: 'Slide 2 notes',
      },
      {
        slideNumber: 1,
        chunkIds: ['s1_a'],
        title: 'Slide 1 title',
        bodyText: 'Slide 1 body',
        speakerNotes: 'Slide 1 notes',
      },
    ])

    expect(units.map((u) => u.locator)).toEqual(['slide=1', 'slide=2'])
    expect(units.map((u) => u.fileName)).toEqual(['unit-slide-001.txt', 'unit-slide-002.txt'])
    expect(units[0]?.body).toBe('[source=Deck Demo][slide=1]\n\nSlide 1 title\n\nSlide 1 body\n\nSlide 1 notes')
    expect(units[1]?.body).toContain('Slide 2 title\n\nSlide 2 body line 1\nSlide 2 body line 2\n\nSlide 2 notes')
  })

  it('adds default image path for visual-heavy slide', () => {
    const units = buildPptxExtractUnits('Deck Demo', [
      {
        slideNumber: 7,
        chunkIds: ['s7_a'],
        title: 'Visual slide',
        visualHeavy: true,
      },
    ])

    expect(units[0]?.images).toEqual(['img/slide-007.png'])
  })
})

describe('writePptxExtractArtifact', () => {
  it('writes pptx slide units and manifest via extract path', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'extract-artifact-pptx-'))
    cleanupDirs.push(repoRoot)

    const { outputDir, manifest } = await writePptxExtractArtifact({
      repoRoot,
      sourceId: 'abcdef123456',
      title: 'Sales Deck',
      slides: [
        {
          slideNumber: 1,
          chunkIds: ['abc_s001_00000'],
          title: 'Opening',
          bodyText: 'Visible text',
          speakerNotes: 'Talk track',
        },
      ],
    })

    expect(manifest.doc_kind).toBe('presentation')
    expect(manifest.units[0]?.locator).toBe('slide=1')
    expect(manifest.units[0]?.file).toBe('unit-slide-001.txt')
    expect(await stat(path.join(outputDir, 'unit-slide-001.txt'))).toBeDefined()
    expect(await stat(path.join(outputDir, 'full.txt'))).toBeDefined()
    const body = await readFile(path.join(outputDir, 'unit-slide-001.txt'), 'utf8')
    expect(body).toContain('[source=Sales Deck][slide=1]')
    expect(body).toContain('Opening\n\nVisible text\n\nTalk track')
  })
})

describe('shouldEmitFullText', () => {
  it('matches spec by doc kind', () => {
    expect(shouldEmitFullText('presentation')).toBe(true)
    expect(shouldEmitFullText('structured-data')).toBe(false)
    expect(shouldEmitFullText('tabular-reference')).toBe(false)
  })
})
