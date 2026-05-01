import type { ExtractUnitInput } from './extractArtifact'
import { extractTextMarkdown } from './textMarkdownExtractor'

export type ExtractFlowInput = {
  sourceId: string
  fileName: string
  mime: string
  body: string
}

export type ExtractFlowResult = {
  units: ExtractUnitInput[]
  chunks: string[]
}

function isTextOrMarkdown(input: Pick<ExtractFlowInput, 'fileName' | 'mime'>): boolean {
  const name = input.fileName.toLowerCase()
  const mime = input.mime.toLowerCase()
  if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) return true
  if (mime === 'text/markdown' || mime === 'text/plain') return true
  return mime.startsWith('text/')
}

export function runExtractFlow(input: ExtractFlowInput): ExtractFlowResult {
  if (isTextOrMarkdown(input)) {
    return extractTextMarkdown(input.sourceId, input.body)
  }
  throw new Error(`unsupported extract flow for file: ${input.fileName}`)
}
