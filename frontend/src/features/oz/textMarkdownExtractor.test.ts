import { describe, expect, it } from 'vitest'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runExtractFlow } from './ingestExtractFlow'
import { loadSchemaRegistry } from './schemaRegistry'
import { extractTextMarkdown } from './textMarkdownExtractor'
import { chunkTextByCharWindow } from './textChunker'

const THIS_DIR = dirname(fileURLToPath(import.meta.url))

describe('chunkTextByCharWindow', () => {
  it('uses 1400/200 default contract', () => {
    const text = 'a'.repeat(2801)
    const chunks = chunkTextByCharWindow(text)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]?.length).toBe(1400)
    expect(chunks[1]?.length).toBe(1400)
    expect(chunks[2]?.length).toBe(401)
    expect(chunks[0]?.slice(-200)).toBe(chunks[1]?.slice(0, 200))
  })
})

describe('extractTextMarkdown', () => {
  it('emits a single unit with empty locator and deterministic chunk ids', () => {
    const payload = 'intro\n\n' + 'b'.repeat(1700)
    const out = extractTextMarkdown('abcdef123456', payload)
    expect(out.units).toHaveLength(1)
    expect(out.units[0]?.locator).toBe('')
    expect(out.units[0]?.fileName).toBe('unit-text-001.txt')
    expect(out.units[0]?.chunkIds).toEqual(['abcdef123456_00000', 'abcdef123456_00001'])
  })

  it('supports section-aware strategy for master-spec-style text', () => {
    const payload = [
      '1 GENERAL',
      'a'.repeat(1200),
      '2 MATERIALS',
      'b'.repeat(1200),
      '3 EXECUTION',
      'c'.repeat(1200),
    ].join('\n\n')
    const out = extractTextMarkdown('abcdef123456', payload, {}, 'section-aware')
    expect(out.units).toHaveLength(1)
    expect(out.chunks).toHaveLength(3)
    expect(out.chunks[0]?.startsWith('1 GENERAL')).toBe(true)
    expect(out.chunks[1]?.startsWith('2 MATERIALS')).toBe(true)
    expect(out.chunks[2]?.startsWith('3 EXECUTION')).toBe(true)
    expect(out.units[0]?.chunkIds).toEqual(['abcdef123456_00000', 'abcdef123456_00001', 'abcdef123456_00002'])
  })
})

describe('runExtractFlow', () => {
  it('routes markdown input through text extractor', () => {
    const result = runExtractFlow({
      sourceId: 'abcdef123456',
      fileName: 'guide.md',
      mime: 'text/markdown',
      body: '# Title\n\nBody',
    })
    expect(result.units[0]?.locator).toBe('')
    expect(result.units[0]?.chunkIds[0]).toBe('abcdef123456_00000')
    expect(result.chunkStrategy).toBe('char-window')
  })

  it('routes master-spec docs through section-aware strategy', () => {
    const result = runExtractFlow({
      sourceId: 'abcdef123456',
      fileName: 'Cumaru Master Spec.txt',
      mime: 'text/plain',
      body: ['1 GENERAL', 'A'.repeat(1200), '2 PRODUCTS', 'B'.repeat(1200)].join('\n\n'),
      docKind: 'master-spec',
    })
    expect(result.chunkStrategy).toBe('section-aware')
    expect(result.chunks).toHaveLength(2)
    expect(result.chunks[0]?.startsWith('1 GENERAL')).toBe(true)
    expect(result.chunks[1]?.startsWith('2 PRODUCTS')).toBe(true)
  })

  it('rejects unsupported file types', () => {
    expect(() =>
      runExtractFlow({
        sourceId: 'abcdef123456',
        fileName: 'slides.pptx',
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        body: 'x',
      }),
    ).toThrow('unsupported extract flow for file: slides.pptx')
  })

  it('routes product catalog json through structured schema extractor', async () => {
    const repoRoot = path.resolve(THIS_DIR, '../../../..')
    const schemas = await loadSchemaRegistry(repoRoot)
    const result = runExtractFlow({
      sourceId: 'abcdef123456',
      fileName: 'product_catalog.json',
      mime: 'application/json',
      body: JSON.stringify({
        schema_version: 1,
        items: [
          {
            sku: 'PGFGD',
            description: 'PALIGHT FLEX GARAGE DOOR TRIM/ WEATHERSTOP',
            product_line_code: 'AT',
            product_line: 'AT',
            sub_category: 'AT-AT-PMoulding',
            uom: 'Each',
            unit_price_median: 22.08,
            total_qty_sold: 540,
            total_sales: 11923.2,
          },
        ],
      }),
      schemas,
    })
    expect(result.schemaName).toBe('product_catalog.schema.json')
    expect(result.chunkStrategy).toBe('per-record')
    expect(result.units[0]?.locator).toBe('[catalog:sku=PGFGD]')
    expect(result.units[0]?.chunkIds).toEqual(['cat_sku_PGFGD'])
    expect(result.units[0]?.body).toContain('PALIGHT FLEX GARAGE DOOR TRIM/ WEATHERSTOP')
    expect(result.units.some((unit) => unit.locator === '[catalog:sub_category=AT-AT-PMoulding]')).toBe(true)
    expect(result.units.some((unit) => unit.locator === '[catalog:line=AT]')).toBe(true)
  })

  it('routes recommendations json through structured schema extractor', async () => {
    const repoRoot = path.resolve(THIS_DIR, '../../../..')
    const schemas = await loadSchemaRegistry(repoRoot)
    const result = runExtractFlow({
      sourceId: 'abcdef123456',
      fileName: 'recommendations.json',
      mime: 'application/json',
      body: JSON.stringify({
        schema_version: 1,
        cross_sell: [{ left_sku: 'CD-RC-RCDeck', right_sku: 'RC-RC-RCBoards', co_invoices: 592, confidence: 0.144, lift: 1.84 }],
        upsell: [],
        margin_substitution: [],
      }),
      schemas,
    })
    expect(result.schemaName).toBe('recommendations.schema.json')
    expect(result.chunkStrategy).toBe('per-record')
    expect(result.units[0]?.locator).toBe('[recs:cross_sell:CD-RC-RCDeck#0]')
    expect(result.units[0]?.chunkIds).toEqual(['recs_xs_CD-RC-RCDeck_0'])
    expect(result.units[0]?.body).toContain('customers who buy CD-RC-RCDeck also buy RC-RC-RCBoards')
  })
})
