import { describe, expect, it } from 'vitest'
import { augmentUserMessageWithTableContext } from '../../shared/tableRowContext'
import { makeCompetitorOfferAttachment } from './competitorComposerContext'

describe('makeCompetitorOfferAttachment', () => {
  it('augments user message when competitor scope is included', () => {
    const a = makeCompetitorOfferAttachment(
      {
        id: 'co-1',
        competitor: 'ABC Supply',
        product: 'Thermory 1x6',
        price: '$12.40',
        productPageUrl: 'https://example.com/p',
      },
      3,
    )
    const out = augmentUserMessageWithTableContext('compare pricing', [a], { scopes: ['competitor'] })
    expect(out).toContain('Thermory')
    expect(out).toContain('ABC Supply')
    expect(out).toContain('compare pricing')
  })
})
