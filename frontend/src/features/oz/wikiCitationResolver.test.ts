import { describe, expect, it } from 'vitest'
import {
  literalWarningForResolved,
  resolveGrammarNodes,
  StreamingGrammarBuffer,
  STALE_OR_INVALID_ARTIFACT_ID,
  STALE_OR_INVALID_PANEL_ID,
  extractCitations,
  extractGrammarNodes,
  resolveCitations,
  splitOzAssistantInlineLine,
  type CitationLookupTables,
} from './wikiCitationResolver'

const tables: CitationLookupTables = {
  docChunks: {
    abc123_p007_00002: { id: 'abc123_p007_00002', status: 'ready' },
    removed_doc: { id: 'removed_doc', status: 'removed' },
  },
  callChunks: {
    c0042_00003: { id: 'c0042_00003', status: 'ready' },
  },
  images: {
    'abc123/img/page-004-fig-01.png': { path: 'abc123/img/page-004-fig-01.png', status: 'ready' },
  },
  catalog: {
    sku: {
      PGFGD: { sku: 'PGFGD', status: 'ready' },
      OLD1: { sku: 'OLD1', status: 'deprecated' },
    },
    line: {
      'DK-MBC-VOYAGE': { code: 'DK-MBC-VOYAGE', status: 'ready' },
    },
    sub: {
      CAPPED_COMPOSITE: { code: 'CAPPED_COMPOSITE', status: 'ready' },
    },
  },
  recommendations: {
    byRule: {
      'cross_sell:CD-RC-RCDeck': [{ id: 'rec-0' }, { id: 'rec-1' }],
    },
    byMethod: {
      cross_sell: { method: 'cross_sell' },
    },
  },
  wikiPages: {
    'concepts/decking-width-tradeoff': { slug: 'concepts/decking-width-tradeoff', status: 'ready' },
    'archive/old-page': { slug: 'archive/old-page', status: 'archived' },
  },
  artifacts: {
    art_known: { id: 'art_known', kind: 'xlsx', title: 'OK' },
  },
  panels: {
    pan_known: { id: 'pan_known', kind: 'table' },
  },
}

describe('extractCitations', () => {
  it('parses all six citation forms', () => {
    const text = [
      '[doc:abc123_p007_00002]',
      '[call:c0042_00003]',
      '[image:abc123/img/page-004-fig-01.png]',
      '[catalog:sku=PGFGD]',
      '[recs:cross_sell:CD-RC-RCDeck#0]',
      '[[wiki:concepts/decking-width-tradeoff]]',
    ].join(' ')
    const parsed = extractCitations(text)
    expect(parsed).toHaveLength(6)
    expect(parsed.map((item) => item.kind)).toEqual(['doc', 'call', 'image', 'catalog', 'recs', 'wiki'])
  })

  it('parses recommendations method citation', () => {
    const parsed = extractCitations('[recs:method=cross_sell]')
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ kind: 'recs', method: 'cross_sell' })
  })
})

describe('resolveCitations', () => {
  it('resolves valid citations to records', () => {
    const text = [
      '[doc:abc123_p007_00002]',
      '[call:c0042_00003]',
      '[image:abc123/img/page-004-fig-01.png]',
      '[catalog:line=DK-MBC-VOYAGE]',
      '[catalog:sub=CAPPED_COMPOSITE]',
      '[recs:cross_sell:CD-RC-RCDeck#1]',
      '[recs:method=cross_sell]',
      '[[wiki:concepts/decking-width-tradeoff]]',
    ].join(' ')
    const resolved = resolveCitations(text, tables)
    expect(resolved.every((item) => item.ok)).toBe(true)
  })

  it('returns reason for removed chunks', () => {
    const [result] = resolveCitations('[doc:removed_doc]', tables)
    expect(result).toMatchObject({ ok: false, reason: 'removed_chunk' })
  })

  it('returns reason for deprecated sku and archived page', () => {
    const [catalog, wiki] = resolveCitations('[catalog:sku=OLD1] [[wiki:archive/old-page]]', tables)
    expect(catalog).toMatchObject({ ok: false, reason: 'deprecated_sku' })
    expect(wiki).toMatchObject({ ok: false, reason: 'archived_page' })
  })

  it('returns invalid index for recommendations tuple that exists', () => {
    const [result] = resolveCitations('[recs:cross_sell:CD-RC-RCDeck#9]', tables)
    expect(result).toMatchObject({ ok: false, reason: 'invalid_recs_index' })
  })

  it('returns missing record when citation key is unknown', () => {
    const [result] = resolveCitations('[catalog:sku=NOPE]', tables)
    expect(result).toMatchObject({ ok: false, reason: 'missing_record' })
  })
})

describe('extractGrammarNodes (artifact + panel)', () => {
  it('parses self-closing artifact and panel tags with attributes', () => {
    const text =
      'See <artifact id="art_known" kind="xlsx" title="Export"/> and <panel id="pan_known" kind="table"/>.'
    const nodes = extractGrammarNodes(text)
    const artifacts = nodes.filter((n) => n.kind === 'artifact')
    const panels = nodes.filter((n) => n.kind === 'panel')
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      kind: 'artifact',
      id: 'art_known',
      artifactKind: 'xlsx',
      title: 'Export',
    })
    expect(panels).toHaveLength(1)
    expect(panels[0]).toMatchObject({ kind: 'panel', id: 'pan_known', panelKind: 'table' })
  })

  it('keeps bracket citations and XML nodes in source order', () => {
    const text = '[doc:abc123_p007_00002] <artifact id="art_known"/> tail'
    const nodes = extractGrammarNodes(text)
    expect(nodes.map((n) => n.kind)).toEqual(['doc', 'artifact'])
  })

  it('does not include XML tags in extractCitations (wiki lint compatibility)', () => {
    const text = '<artifact id="art_known"/> [[wiki:concepts/decking-width-tradeoff]]'
    const cites = extractCitations(text)
    expect(cites.map((c) => c.kind)).toEqual(['wiki'])
  })
})

describe('splitOzAssistantInlineLine', () => {
  it('interleaves bracket cites and XML grammar tags on one line', () => {
    const segs = splitOzAssistantInlineLine('[doc:abc123_p007_00002] mid <artifact id="art_known"/>')
    expect(segs.map((s) => s.type)).toEqual(['cite', 'text', 'grammar'])
  })
})

describe('resolveGrammarNodes', () => {
  it('resolves known artifact/panel ids from lookup tables', () => {
    const text = '<artifact id="art_known"/><panel id="pan_known"/>'
    const resolved = resolveGrammarNodes(text, tables)
    expect(resolved.every((r) => r.ok)).toBe(true)
  })

  it('flags unknown ids with invalid reasons and literal warning strings', () => {
    const text = '<artifact id="art_missing"/><panel id="pan_missing"/>'
    const resolved = resolveGrammarNodes(text, tables)
    expect(resolved[0]).toMatchObject({ ok: false, reason: 'invalid_artifact_id' })
    expect(literalWarningForResolved(resolved[0])).toBe(STALE_OR_INVALID_ARTIFACT_ID)
    expect(resolved[1]).toMatchObject({ ok: false, reason: 'invalid_panel_id' })
    expect(literalWarningForResolved(resolved[1])).toBe(STALE_OR_INVALID_PANEL_ID)
  })
})

describe('StreamingGrammarBuffer (SSE)', () => {
  it('buffers from < until > across chunks', () => {
    const buf = new StreamingGrammarBuffer()
    expect(buf.append('before ')).toEqual({ safeText: 'before ' })
    expect(buf.append('<arti')).toEqual({ safeText: '' })
    expect(buf.append('fact id="art_known" kind="xlsx"/>')).toEqual({
      safeText: '<artifact id="art_known" kind="xlsx"/>',
    })
    expect(buf.append(' after')).toEqual({ safeText: ' after' })
    expect(buf.flush()).toEqual({ safeText: '' })
  })

  it('flush emits incomplete tag suffix literally', () => {
    const buf = new StreamingGrammarBuffer()
    expect(buf.append('x <panel id=')).toEqual({ safeText: 'x ' })
    expect(buf.flush().safeText).toBe('<panel id=')
  })
})
