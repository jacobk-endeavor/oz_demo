import { describe, it, expect } from 'vitest'
import { KNOWLEDGE_BASE_MAX_ROWS, tabularFromText } from './knowledgeBaseTabular'

describe('tabularFromText', () => {
  it('parses a simple two-line CSV with header', () => {
    const t = tabularFromText('x.csv', 'a,b\nc1,c2\nc3,c4')
    expect(t.headers).toEqual(['a', 'b'])
    expect(t.rows).toEqual([
      ['c1', 'c2'],
      ['c3', 'c4'],
    ])
  })

  it('parses TSV by extension', () => {
    const t = tabularFromText('t.tsv', 'h1\th2\nv1\tv2')
    expect(t.headers).toEqual(['h1', 'h2'])
    expect(t.rows).toEqual([['v1', 'v2']])
  })

  it('parses JSON object as key–value', () => {
    const t = tabularFromText('c.json', '{"a":1,"b":"x"}')
    expect(t.headers).toEqual(['Key', 'Value'])
    expect(t.rows).toEqual([
      ['a', '1'],
      ['b', 'x'],
    ])
  })

  it('parses JSON array of objects with union keys', () => {
    const t = tabularFromText('d.json', '[{"a":"1"},{"b":2}]')
    expect(t.rows.length).toBe(2)
    expect(t.headers).toContain('a')
    expect(t.headers).toContain('b')
  })

  it('treats plain text as a single line column', () => {
    const t = tabularFromText('note.txt', 'one\ntwo')
    expect(t.headers).toEqual(['Line'])
    expect(t.rows).toEqual([['one'], ['two']])
  })

  it('caps long tables', () => {
    const lines = ['c,c', ...Array.from({ length: KNOWLEDGE_BASE_MAX_ROWS + 20 }, () => 'a,b')]
    const t = tabularFromText('big.csv', lines.join('\n'))
    expect(t.rows.length).toBe(KNOWLEDGE_BASE_MAX_ROWS)
  })
})
