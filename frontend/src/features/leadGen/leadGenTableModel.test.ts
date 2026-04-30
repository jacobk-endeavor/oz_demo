import { describe, expect, it } from 'vitest'
import {
  applyLeadTableView,
  defaultLeadTableViewState,
  matchAllSourcesFromChat,
  parseSortColumn,
  processLeadTableChat,
} from './leadGenTableModel'
import { buildLeadTableLlmContext } from './leadTableLlmContext'
import { buildMilwaukeeDistributorRows } from './milwaukeeDistributorsMock'

describe('processLeadTableChat (no Milwaukee chat shortcut)', () => {
  it('does not auto-open lead context for former Milwaukee runbook phrasing', () => {
    const prev = defaultLeadTableViewState()
    prev.dataset = 'expanded'
    const out = processLeadTableChat('give me milwaukee distributors', prev, 'oz')
    expect(out.openLeadContext).toBe(false)
    expect(out.state.dataset).toBe('expanded')
  })
})

describe('processLeadTableChat fallbacks', () => {
  it('always returns a string reply and describes state when the intent is unknown', () => {
    const prev = defaultLeadTableViewState()
    const out = processLeadTableChat('pizza delivery radius', prev, 'tables')
    expect(out.reply.length).toBeGreaterThan(20)
    expect(out.reply).toMatch(/sort|leads|location|source|table|mapped/i)
    expect(out.rephase).toBe(false)
  })

  it('does not show double periods after the table state in the short follow-up line', () => {
    const prev = {
      ...defaultLeadTableViewState(),
      sourceFilter: ['outlook' as const],
      sortPrimary: 'source' as const,
      sortPrimaryDir: 'asc' as const,
      sortSecondary: 'industry' as const,
      sortSecondaryDir: 'asc' as const,
    }
    const out = processLeadTableChat('ok', prev, 'oz', { priorUserMessages: ['x'] })
    expect(out.reply).toMatch(/caught that/)
    expect(out.reply).toMatch(/primary bucket\)\./)
    expect(out.reply).not.toMatch(/\.\./)
  })
})

describe('processLeadTableChat source filter phrasing', () => {
  it('filters to Apollo for “give me all of the apollo leads” (not the short “not a table command” reply)', () => {
    const prev = defaultLeadTableViewState()
    const out = processLeadTableChat('give me all of the apollo leads', prev, 'oz', {
      priorUserMessages: ['earlier turn'],
    })
    expect(out.state.sourceFilter).toEqual(['apollo'])
    expect(out.rephase).toBe(true)
    expect(out.reply).toMatch(/Apollo/i)
    expect(out.reply).not.toMatch(/did not run it as a table command/i)
  })

  it('filters to Apollo for “all apollo” with prior user messages (avoid snippy follow-up false negative)', () => {
    const prev = defaultLeadTableViewState()
    const out = processLeadTableChat('all apollo', prev, 'oz', { priorUserMessages: ['earlier'] })
    expect(out.state.sourceFilter).toEqual(['apollo'])
    expect(out.rephase).toBe(true)
    expect(out.reply).not.toMatch(/did not run it as a table command/i)
  })

  it('collects every named system for “apollo and outlook”', () => {
    expect(matchAllSourcesFromChat('apollo and outlook')).toEqual(['outlook', 'apollo'])
  })

  it('treats two-word “sales loft” as Salesloft for regex fallback', () => {
    expect(matchAllSourcesFromChat('outlook and sales loft leads')).toEqual(['salesloft', 'outlook'])
  })

  it('applies a multi-source filter and mentions both in the reply (short line with prior is still a command)', () => {
    const prev = defaultLeadTableViewState()
    const out = processLeadTableChat('apollo and outlook', prev, 'oz', { priorUserMessages: ['x'] })
    expect(out.state.sourceFilter).toEqual(['outlook', 'apollo'])
    expect(out.rephase).toBe(true)
    expect(out.reply).toMatch(/Outlook.*Apollo|Apollo.*Outlook/i)
    expect(out.reply).toMatch(/those sources/i)
    expect(out.reply).not.toMatch(/did not run it as a table command/i)
  })

  it('“source:” phrasing is a column-style filter and does not clobber the primary sort', () => {
    const prev = { ...defaultLeadTableViewState(), sortPrimary: 'location' as const, sortPrimaryDir: 'desc' as const }
    const out = processLeadTableChat('source: apollo', prev, 'oz')
    expect(out.state.sourceFilter).toEqual(['apollo'])
    expect(out.state.sortPrimary).toBe('location')
    expect(out.state.sortPrimaryDir).toBe('desc')
    expect(out.reply).toMatch(/sort is unchanged|Source\*\* column/i)
  })
})

describe('parseSortColumn / sub-sort', () => {
  it('parses sub-sort with descending for the secondary', () => {
    const a = parseSortColumn('sub-sort by industry descending')
    expect(a.primary).toBe('source')
    expect(a.secondary).toBe('industry')
    expect(a.secondaryDir).toBe('desc')
  })

  it('double sort shortcut sets source + name', () => {
    const a = parseSortColumn('double sort: lead source, then the name')
    expect(a.primary).toBe('source')
    expect(a.secondary).toBe('name')
  })
})

describe('buildLeadTableLlmContext', () => {
  it('embeds a TSV header and the current list state', () => {
    const s = defaultLeadTableViewState()
    const rows = applyLeadTableView(buildMilwaukeeDistributorRows('standard'), s)
    const ctx = buildLeadTableLlmContext(s, rows, { maxRows: 5, maxChars: 50_000 })
    expect(ctx).toMatch(/```tsv/)
    expect(ctx).toMatch(/\tindustry\t/)
    expect(ctx).toMatch(/sub-sort|sorted by|primary/i)
  })
})

describe('applyLeadTableView columnTextFilters', () => {
  it('keeps only rows where each set column cell contains the filter substring', () => {
    const s = { ...defaultLeadTableViewState(), columnTextFilters: { size: '11-50' } }
    const rows = buildMilwaukeeDistributorRows('standard')
    const out = applyLeadTableView(rows, s)
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((r) => r.size.toLowerCase().includes('11-50'))).toBe(true)
  })

  it('likely buyers (engaged + thermory on blurb/products) is never empty for the standard set', () => {
    const rows = buildMilwaukeeDistributorRows('standard')
    const s = {
      ...defaultLeadTableViewState(),
      engagement: 'engaged' as const,
      columnTextFilters: { description: 'thermory' },
    }
    const out = applyLeadTableView(rows, s)
    expect(out.length).toBeGreaterThanOrEqual(3)
    expect(out.every((r) => r.engagement === 'engaged')).toBe(true)
    expect(
      out.every((r) =>
        /thermory/i.test(`${r.description} ${r.productsRequested ?? ''}`),
      ),
    ).toBe(true)
  })
})

describe('processLeadTableChat heuristics (no API)', () => {
  it('maps “employees >1000” to a size text filter', () => {
    const prev = defaultLeadTableViewState()
    const out = processLeadTableChat('employees >1000', prev, 'oz')
    expect(out.state.columnTextFilters.size).toBe('1,001')
    expect(out.rephase).toBe(true)
    expect(out.reply).toMatch(/Size|narrow/i)
  })

  it('maps “only in pharma” to an industry text filter', () => {
    const prev = defaultLeadTableViewState()
    const out = processLeadTableChat('only in pharma', prev, 'oz')
    expect(out.state.columnTextFilters.industry).toMatch(/pharma/i)
    expect(out.rephase).toBe(true)
  })
})
