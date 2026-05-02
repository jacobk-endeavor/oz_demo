import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  resolveCitation,
  type CitationLookupTables,
} from '../../../../shared/oz/citationGrammarResolver'
import { extractGrammarNodes } from '../../features/oz/wikiCitationResolver'
import { ArtifactPill } from './ArtifactPill'

const tables: CitationLookupTables = {
  artifacts: {
    art_ok: {
      id: 'art_ok',
      kind: 'xlsx',
      title: 'Margin export',
      size_bytes: 48213,
      signed_url: 'https://example.test/art.xlsx',
    },
  },
}

describe('ArtifactPill', () => {
  it('renders title, kind, size, and download for a resolved artifact', () => {
    const [node] = extractGrammarNodes('<artifact id="art_ok" kind="xlsx" title="Ignored"/>')
    expect(node?.kind).toBe('artifact')
    const resolved = resolveCitation(node!, tables)
    expect(resolved.ok).toBe(true)
    render(<ArtifactPill resolved={resolved} />)
    expect(screen.getByTestId('oz-artifact-pill')).toBeInTheDocument()
    expect(screen.getByText('Margin export')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute(
      'href',
      'https://example.test/art.xlsx',
    )
  })

  it('shows stale warning when artifact id is unknown', () => {
    const [node] = extractGrammarNodes('<artifact id="art_missing"/>')
    const resolved = resolveCitation(node!, tables)
    expect(resolved.ok).toBe(false)
    render(<ArtifactPill resolved={resolved} />)
    expect(screen.getByText(/Stale or invalid artifact id/i)).toBeInTheDocument()
  })
})
