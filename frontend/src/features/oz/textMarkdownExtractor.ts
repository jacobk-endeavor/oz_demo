import type { ExtractUnitInput } from './extractArtifact'
import { chunkTextByCharWindow, type CharWindowChunkerOptions } from './textChunker'

export type TextMarkdownExtractResult = {
  units: ExtractUnitInput[]
  chunks: string[]
}

export function extractTextMarkdown(
  sourceId: string,
  body: string,
  options: CharWindowChunkerOptions = {},
): TextMarkdownExtractResult {
  const chunks = chunkTextByCharWindow(body, options)
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
