import { describe, expect, it } from 'vitest'
import { runExtractFlow } from './ingestExtractFlow'
import { extractTextMarkdown } from './textMarkdownExtractor'
import { chunkTextByCharWindow } from './textChunker'

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
})
