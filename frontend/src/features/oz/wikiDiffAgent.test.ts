import { describe, expect, it } from 'vitest'
import { applyDiffToPage, applySectionLockedDiff } from './wikiDiffAgent'

const page = `---
type: entity
slug: entities/products/voyage
title: Voyage
created: 2026-05-01
updated: 2026-05-01
source_count: 2
---
## Summary
- Original summary line.

## Evidence
- Existing evidence [doc:abc123_p001_00000]

## Open Questions
- None.
`

describe('applySectionLockedDiff', () => {
  it('returns section replacement and frontmatter updates', () => {
    const result = applySectionLockedDiff({
      page,
      section_name: 'Evidence',
      current_section_text: '- Existing evidence [doc:abc123_p001_00000]',
      proposed_change: '- New evidence [doc:def456_p002_00001]',
    })
    expect(result.new_section_text).toContain('## Evidence')
    expect(result.new_section_text).toContain('New evidence')
    expect(result.frontmatter_updates.source_count_delta).toBe(1)
  })

  it('appends contradiction blocks instead of overwriting', () => {
    const result = applySectionLockedDiff({
      page,
      section_name: 'Evidence',
      current_section_text: '- Existing evidence [doc:abc123_p001_00000]',
      proposed_change: '- Ignored due to contradiction path',
      contradiction: {
        prior_claim: 'lead times are always 5 days [doc:abc123]',
        new_claim: 'lead times vary by region [doc:def456]',
        date: '2026-05-01',
      },
    })
    expect(result.new_section_text).toContain('CONTRADICTION (2026-05-01)')
    expect(result.new_section_text).toContain('prior claim lead times are always 5 days')
  })
})

describe('applyDiffToPage', () => {
  it('applies section-locked update and bumps source_count', () => {
    const merged = applyDiffToPage(page, {
      page,
      section_name: 'Evidence',
      current_section_text: '- Existing evidence [doc:abc123_p001_00000]',
      proposed_change: '- New evidence [doc:def456_p002_00001]',
    })
    expect(merged).toContain('source_count: 3')
    expect(merged).toContain('## Evidence\n- New evidence [doc:def456_p002_00001]')
    expect(merged).toContain('## Open Questions')
  })
})
