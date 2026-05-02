import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

afterEach(() => {
  cleanup()
})
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
    art_png: {
      id: 'art_png',
      kind: 'png',
      title: 'Margin chart',
      size_bytes: 12_000,
      signed_url: 'https://example.test/chart.png',
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

  describe('P4-1 KB-promotion button', () => {
    it('renders Save to KB for a promotable kind when onIngestArtifact is provided', async () => {
      const [node] = extractGrammarNodes('<artifact id="art_ok" kind="xlsx"/>')
      const resolved = resolveCitation(node!, tables)
      const onIngestArtifact = vi
        .fn()
        .mockResolvedValue({ ok: true, source_id: 'src_123abc' })
      render(<ArtifactPill resolved={resolved} onIngestArtifact={onIngestArtifact} />)

      const btn = screen.getByTestId('oz-artifact-promote')
      expect(btn).toHaveTextContent(/save to kb/i)
      await userEvent.click(btn)
      expect(onIngestArtifact).toHaveBeenCalledWith('art_ok')
      // After successful promotion, the chip flips to "Indexed".
      expect(await screen.findByTestId('oz-artifact-promoted')).toHaveTextContent(/indexed/i)
    })

    it('flips to Retry KB on a failed promotion', async () => {
      const [node] = extractGrammarNodes('<artifact id="art_ok" kind="pdf"/>')
      const tablesPdf: CitationLookupTables = {
        artifacts: {
          ...tables.artifacts,
          art_ok: { ...tables.artifacts!.art_ok, kind: 'pdf' },
        },
      }
      const resolved = resolveCitation(node!, tablesPdf)
      const onIngestArtifact = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, error: 'spaces_get_object_failed' })
        .mockResolvedValueOnce({ ok: true, source_id: 'src_retry' })
      render(<ArtifactPill resolved={resolved} onIngestArtifact={onIngestArtifact} />)

      await userEvent.click(screen.getByTestId('oz-artifact-promote'))
      const retry = await screen.findByTestId('oz-artifact-promote-retry')
      expect(retry).toHaveTextContent(/retry kb/i)
      await userEvent.click(retry)
      expect(await screen.findByTestId('oz-artifact-promoted')).toBeInTheDocument()
      expect(onIngestArtifact).toHaveBeenCalledTimes(2)
    })

    it('omits the button for non-promotable kinds (e.g. png)', () => {
      const [node] = extractGrammarNodes('<artifact id="art_png" kind="png"/>')
      const resolved = resolveCitation(node!, tables)
      const onIngestArtifact = vi.fn()
      render(<ArtifactPill resolved={resolved} onIngestArtifact={onIngestArtifact} />)
      expect(screen.queryByTestId('oz-artifact-promote')).toBeNull()
    })

    it('omits the button when onIngestArtifact is not provided', () => {
      const [node] = extractGrammarNodes('<artifact id="art_ok" kind="xlsx"/>')
      const resolved = resolveCitation(node!, tables)
      render(<ArtifactPill resolved={resolved} />)
      expect(screen.queryByTestId('oz-artifact-promote')).toBeNull()
    })
  })
})
