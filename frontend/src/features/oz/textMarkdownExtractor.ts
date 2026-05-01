import type { ExtractUnitInput } from './extractArtifact'
import { chunkTextByCharWindow, type CharWindowChunkerOptions } from './textChunker'

export type TextMarkdownExtractResult = {
  units: ExtractUnitInput[]
  chunks: string[]
}

export type TextChunkStrategy = 'char-window' | 'section-aware'

const SECTION_HEADING = /^\s*(?:#{1,6}\s+|(?:\d+(?:\.\d+)*)\s+[A-Z].*|[A-Z][A-Z0-9-]*(?:\s+[A-Z0-9][A-Z0-9-]*)+)\s*$/

function splitIntoSections(text: string): string[] {
  const normalized = text.trim()
  if (normalized.length === 0) return []
  const lines = normalized.split('\n')
  const sections: string[] = []
  let current: string[] = []
  for (const line of lines) {
    if (SECTION_HEADING.test(line) && current.length > 0) {
      sections.push(current.join('\n').trim())
      current = []
    }
    current.push(line)
  }
  if (current.length > 0) sections.push(current.join('\n').trim())
  return sections.filter((section) => section.length > 0)
}

function chunkTextBySectionAwareWindow(text: string, options: CharWindowChunkerOptions = {}): string[] {
  const sections = splitIntoSections(text)
  if (sections.length === 0) return []
  const chunks: string[] = []
  for (const section of sections) {
    chunks.push(...chunkTextByCharWindow(section, options))
  }
  return chunks
}

export function extractTextMarkdown(
  sourceId: string,
  body: string,
  options: CharWindowChunkerOptions = {},
  strategy: TextChunkStrategy = 'char-window',
): TextMarkdownExtractResult {
  const chunks =
    strategy === 'section-aware'
      ? chunkTextBySectionAwareWindow(body, options)
      : chunkTextByCharWindow(body, options)
  if (chunks.length === 0) return { units: [], chunks }

  const chunkIds = chunks.map((_, index) => `${sourceId}_${index.toString().padStart(5, '0')}`)
  const units: ExtractUnitInput[] = [
    {
      locator: '',
      body: body.trim(),
      fileName: 'unit-text-001.txt',
      chunkIds,
    },
  ]

  return { units, chunks }
}
