import type { ExtractUnitInput } from './extractArtifact'
import type { DocKind } from './docKindClassifier'
import { type LoadedSchema } from './schemaRegistry'
import { extractStructuredData } from './structuredDataExtractor'
import { extractTextMarkdown } from './textMarkdownExtractor'

export type ExtractFlowInput = {
  sourceId: string
  fileName: string
  mime: string
  body: string
  docKind?: DocKind
  schemas?: LoadedSchema[]
}

export type ExtractFlowResult = {
  units: ExtractUnitInput[]
  chunks: string[]
  schemaName?: string
  chunkStrategy?: 'char-window' | 'section-aware' | 'row-batch' | 'per-record'
}

function isTextOrMarkdown(input: Pick<ExtractFlowInput, 'fileName' | 'mime'>): boolean {
  const name = input.fileName.toLowerCase()
  const mime = input.mime.toLowerCase()
  if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) return true
  if (mime === 'text/markdown' || mime === 'text/plain') return true
  return mime.startsWith('text/')
}

function isJsonFile(input: Pick<ExtractFlowInput, 'fileName' | 'mime'>): boolean {
  const name = input.fileName.toLowerCase()
  const mime = input.mime.toLowerCase()
  if (name.endsWith('.json')) return true
  return mime === 'application/json' || mime.endsWith('+json')
}

export function runExtractFlow(input: ExtractFlowInput): ExtractFlowResult {
  if (isJsonFile(input) && input.schemas != null) {
    const structured = extractStructuredData({
      fileName: input.fileName,
      body: input.body,
      schemas: input.schemas,
    })
    if (!structured.ok) {
      if (structured.reason === 'schema_validation_failed') {
        throw new Error(`structured extract schema_validation_failed: ${structured.errors.join('; ')}`)
      }
      if (structured.reason === 'invalid_json') {
        throw new Error(`structured extract invalid_json: ${structured.message}`)
      }
      throw new Error(`structured extract ${structured.reason} for file: ${input.fileName}`)
    }
    return {
      units: structured.units,
      chunks: structured.chunks,
      schemaName: structured.schemaName,
      chunkStrategy: 'per-record',
    }
  }
  if (isTextOrMarkdown(input)) {
    const chunkStrategy = input.docKind === 'master-spec' ? 'section-aware' : 'char-window'
    const extracted = extractTextMarkdown(input.sourceId, input.body, {}, chunkStrategy)
    return {
      ...extracted,
      chunkStrategy,
    }
  }
  throw new Error(`unsupported extract flow for file: ${input.fileName}`)
}
