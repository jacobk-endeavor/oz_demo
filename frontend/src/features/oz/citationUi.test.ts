import { describe, expect, it } from 'vitest'
import {
  citationClickDetail,
  citationHoverTitle,
  splitLineAtOzCitations,
  wrapOzCitationsForObsidianHtml,
} from './citationUi'
import { parseOzCitationToken, resolveCitation, type CitationLookupTables } from './wikiCitationResolver'

const sampleTables: CitationLookupTables = {
  docChunks: {
    c1: {
      id: 'c1',
      content: 'Hello chunk',
      source_title: 'My PDF',
    },
  },
  wikiPages: {
    'concepts/foo': { slug: 'concepts/foo', summary: 'First line of wiki.' },
  },
}

describe('citationUi', () => {
  it('splits a line at citation tokens', () => {
    const segs = splitLineAtOzCitations('See [doc:c1] and [[wiki:concepts/foo]] end')
    expect(segs).toEqual([
      { type: 'text', text: 'See ' },
      { type: 'cite', raw: '[doc:c1]' },
      { type: 'text', text: ' and ' },
      { type: 'cite', raw: '[[wiki:concepts/foo]]' },
      { type: 'text', text: ' end' },
    ])
  })

  it('produces hover text from resolved doc + wiki', () => {
    const d = parseOzCitationToken('[doc:c1]')!
    const dr = resolveCitation(d, sampleTables)
    expect(citationHoverTitle(d, dr)).toContain('Hello chunk')
    expect(citationHoverTitle(d, dr)).toContain('My PDF')

    const w = parseOzCitationToken('[[wiki:concepts/foo]]')!
    const wr = resolveCitation(w, sampleTables)
    expect(citationHoverTitle(w, wr)).toContain('First line of wiki')
  })

  it('click detail carries stable ids for doc and wiki', () => {
    const d = parseOzCitationToken('[doc:c1]')!
    expect(citationClickDetail(d, resolveCitation(d, sampleTables))).toEqual({
      kind: 'doc',
      chunkId: 'c1',
      raw: '[doc:c1]',
    })
    const w = parseOzCitationToken('[[wiki:concepts/foo]]')!
    expect(citationClickDetail(w, resolveCitation(w, sampleTables))).toEqual({
      kind: 'wiki',
      slug: 'concepts/foo',
      raw: '[[wiki:concepts/foo]]',
    })
  })

  it('wrapOzCitationsForObsidianHtml emits title and classes', () => {
    const md = 'Text [doc:c1] done'
    const html = wrapOzCitationsForObsidianHtml(md, sampleTables)
    expect(html).toContain('class="oz-cite oz-cite-doc"')
    expect(html).toContain('title="')
    expect(html).toContain('[doc:c1]')
  })
})
