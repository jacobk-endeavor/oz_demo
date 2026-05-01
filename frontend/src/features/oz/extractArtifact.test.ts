import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildExcelExtractUnits,
  buildExtractManifest,
  buildPptxExtractUnits,
  shouldEmitFullText,
  writePdfExtractArtifact,
  writePptxExtractArtifact,
  writeExtractArtifact,
  writeExcelExtractArtifact,
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

  it('allows empty locator for text/markdown units', () => {
    const manifest = buildExtractManifest({
      repoRoot: '/tmp/ignored',
      sourceId: 'abcdef123456',
      title: 'Notes',
      docKind: 'marketing',
      units: [{ locator: '   ', fileName: 'unit-text-001.txt', body: 'hello', chunkIds: ['c1'] }],
    })
    expect(manifest.units[0]?.locator).toBe('')
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

describe('buildExcelExtractUnits', () => {
  it('chunks each sheet into 20-row units with header prepended', () => {
    const workbook = XLSX.utils.book_new()
    const pricingRows = Array.from({ length: 23 }, (_, idx) => ({ SKU: `A-${idx + 1}`, Price: `${idx + 10}` }))
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pricingRows), 'Pricing')
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { Region: 'West', Discount: '2%' },
        { Region: 'East', Discount: '4%' },
      ]),
      'Discounts',
    )
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const result = buildExcelExtractUnits({
      sourceId: 'abcdef123456',
      workbook: data,
    })

    expect(result.sheetCount).toBe(2)
    expect(result.failedSheets).toEqual([])
    expect(result.units).toHaveLength(3)

    expect(result.units[0]).toMatchObject({
      locator: 'sheet=Pricing rows=1-20',
      chunkIds: ['abcdef123456_pricing_r00001_00020'],
      fileName: 'unit-sheet-pricing-r00001_00020.csv',
    })
    expect(result.units[0]?.body.startsWith('SKU,Price\n')).toBe(true)

    expect(result.units[1]).toMatchObject({
      locator: 'sheet=Pricing rows=21-23',
      chunkIds: ['abcdef123456_pricing_r00021_00023'],
      fileName: 'unit-sheet-pricing-r00021_00023.csv',
    })
    expect(result.units[2]).toMatchObject({
      locator: 'sheet=Discounts rows=1-2',
      chunkIds: ['abcdef123456_discounts_r00001_00002'],
      fileName: 'unit-sheet-discounts-r00001_00002.csv',
    })
  })

  it('integrates with artifact writer for workbook extracts', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        { SKU: 'A-1', Color: 'Pebble Grey' },
        { SKU: 'A-2', Color: 'Walnut' },
      ]),
      'Colors',
    )
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'extract-artifact-excel-'))
    cleanupDirs.push(repoRoot)

    const result = await writeExcelExtractArtifact({
      repoRoot,
      sourceId: 'abcdef123456',
      title: 'Color Chart',
      workbook: data,
    })

    expect(result.sheetCount).toBe(1)
    expect(result.failedSheets).toEqual([])
    expect(result.manifest.doc_kind).toBe('tabular-reference')
    expect(result.manifest.has_full_text).toBe(false)
    expect(result.manifest.units).toHaveLength(1)
    await expect(stat(path.join(result.outputDir, 'full.txt'))).rejects.toThrow()
    expect(await stat(path.join(result.outputDir, 'unit-sheet-colors-r00001_00002.csv'))).toBeDefined()
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
