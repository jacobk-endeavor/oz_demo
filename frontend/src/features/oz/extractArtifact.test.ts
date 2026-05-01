import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildExtractManifest,
  shouldEmitFullText,
  writeExtractArtifact,
  writePdfExtractArtifact,
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

describe('shouldEmitFullText', () => {
  it('matches spec by doc kind', () => {
    expect(shouldEmitFullText('presentation')).toBe(true)
    expect(shouldEmitFullText('structured-data')).toBe(false)
    expect(shouldEmitFullText('tabular-reference')).toBe(false)
  })
})

describe('writePdfExtractArtifact', () => {
  it('writes per-page PDF units using fallback extractor when primary is sparse', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'extract-pdf-artifact-'))
    cleanupDirs.push(repoRoot)

    const result = await writePdfExtractArtifact({
      repoRoot,
      sourceId: 'abcdef123456',
      title: 'PDF Doc',
      docKind: 'tech-bulletin',
      pdfBytes: new Uint8Array([1, 2, 3]),
      primaryExtractor: async () => ['short'],
      fallbackExtractor: async () => ['A'.repeat(60), 'B'.repeat(80)],
    })

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok result')
    expect(result.extractor).toBe('pdfminer')
    expect(result.pageCount).toBe(2)
    expect(await stat(path.join(result.outputDir, 'unit-page-001.txt'))).toBeDefined()
    expect(await stat(path.join(result.outputDir, 'unit-page-002.txt'))).toBeDefined()
    const manifestText = await readFile(path.join(result.outputDir, 'manifest.json'), 'utf8')
    const manifest = JSON.parse(manifestText) as { units: Array<{ locator: string; file: string }> }
    expect(manifest.units.map((u) => u.locator)).toEqual(['page=1', 'page=2'])
    expect(manifest.units.map((u) => u.file)).toEqual(['unit-page-001.txt', 'unit-page-002.txt'])
  })

  it('returns needs_ocr when both extractors produce low text', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'extract-pdf-needs-ocr-'))
    cleanupDirs.push(repoRoot)

    const result = await writePdfExtractArtifact({
      repoRoot,
      sourceId: 'abcdef123456',
      title: 'Image PDF',
      docKind: 'tech-bulletin',
      pdfBytes: new Uint8Array([4, 5, 6]),
      primaryExtractor: async () => [''],
      fallbackExtractor: async () => ['still too short'],
    })

    expect(result).toEqual({
      status: 'needs_ocr',
      reason: 'needs_ocr',
      pageCount: 1,
      attemptedExtractors: ['pypdf', 'pdfminer'],
    })
  })
})
