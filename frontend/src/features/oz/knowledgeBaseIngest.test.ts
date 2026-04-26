import * as XLSX from 'xlsx'
import { describe, it, expect } from 'vitest'
import { classifyKnowledgeFile, isLikelyPasswordOrEncryptionError } from './knowledgeBaseIngest'
import { tabularFromText } from './knowledgeBaseTabular'

function mockFile(name: string, type: string) {
  return { name, type, size: 1 } as File
}

describe('classifyKnowledgeFile', () => {
  it('classifies by pdf extension', () => {
    expect(classifyKnowledgeFile(mockFile('x.PDF', ''))).toBe('pdf')
  })
  it('classifies by image mime', () => {
    expect(classifyKnowledgeFile(mockFile('a', 'image/png'))).toBe('image')
  })
  it('classifies heic by extension', () => {
    expect(classifyKnowledgeFile(mockFile('p.heic', ''))).toBe('image')
  })
  it('classifies xlsx', () => {
    expect(classifyKnowledgeFile(mockFile('t.xlsx', 'application/zip'))).toBe('excel')
  })
  it('defaults to text for unknown', () => {
    expect(classifyKnowledgeFile(mockFile('notes.txt', 'text/plain'))).toBe('text')
  })
})

describe('Excel → CSV → table (same as ingest)', () => {
  it('round-trips a sheet through sheet_to_csv and tabularFromText', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['h1', 'h2'],
      ['a', 'b'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'First')
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets.First!, { FS: ',' })
    const t = tabularFromText('First.csv', csv)
    expect(t.headers).toEqual(['h1', 'h2'])
    expect(t.rows).toEqual([['a', 'b']])
  })
})

describe('isLikelyPasswordOrEncryptionError', () => {
  it('returns true for password in message', () => {
    expect(isLikelyPasswordOrEncryptionError(new Error('File is password-protected'))).toBe(true)
  })
  it('returns false for unrelated', () => {
    expect(isLikelyPasswordOrEncryptionError(new Error('not a number'))).toBe(false)
  })
})
