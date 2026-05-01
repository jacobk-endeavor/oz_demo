import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildExcelExtractUnits,
  buildExtractManifest,
  shouldEmitFullText,
  writeExcelExtractArtifact,
  writeExtractArtifact,
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
