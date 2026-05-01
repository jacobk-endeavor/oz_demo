import { createHash } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type ExtractDocKind =
  | 'marketing'
  | 'install'
  | 'tech-bulletin'
  | 'warranty'
  | 'order-guide'
  | 'presentation'
  | 'tabular-reference'
  | 'structured-data'
  | 'spec-sheet'
  | 'visual-catalog'
  | 'master-spec'
  | 'catalog'
  | 'unknown'

export type ExtractUnitInput = {
  locator: string
  body: string
  chunkIds: string[]
  fileName: string
  images?: string[]
}

export type ExtractManifestUnit = {
  locator: string
  file: string
  chunk_ids: string[]
  content_hash: string
  images?: string[]
}

export type ExtractManifest = {
  manifest_version: 1
  source_id: string
  title: string
  doc_kind: ExtractDocKind
  brand?: string
  product_line?: string
  year?: number
  distributor_branded?: boolean
  has_full_text: boolean
  full_text_file?: string
  units: ExtractManifestUnit[]
}

export type WriteExtractArtifactInput = {
  repoRoot: string
  sourceId: string
  title: string
  docKind: ExtractDocKind
  units: ExtractUnitInput[]
  brand?: string
  productLine?: string
  year?: number
  distributorBranded?: boolean
}

const FULL_TEXT_DOC_KINDS = new Set<ExtractDocKind>([
  'marketing',
  'install',
  'tech-bulletin',
  'warranty',
  'order-guide',
  'presentation',
])

function safeRelativePath(fileName: string): string {
  const normalized = fileName.replaceAll('\\', '/').trim()
  if (normalized.length === 0) throw new Error('artifact file path cannot be empty')
  if (path.isAbsolute(normalized)) throw new Error(`artifact file path must be relative: ${fileName}`)
  if (normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`artifact file path must not contain dot segments: ${fileName}`)
  }
  return normalized
}

function normalizeSourceId(sourceId: string): string {
  const normalized = sourceId.trim().toLowerCase()
  if (!/^[0-9a-f]{12}$/.test(normalized)) {
    throw new Error(`invalid source_id: ${sourceId}`)
  }
  return normalized
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function contentHash(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
}

export function shouldEmitFullText(docKind: ExtractDocKind): boolean {
  return FULL_TEXT_DOC_KINDS.has(docKind)
}

export function buildExtractManifest(input: WriteExtractArtifactInput): ExtractManifest {
  const sourceId = normalizeSourceId(input.sourceId)
  const hasFullText = shouldEmitFullText(input.docKind)
  const units: ExtractManifestUnit[] = input.units.map((unit) => {
    const file = safeRelativePath(unit.fileName)
    const images = unit.images?.map(safeRelativePath)
    const normalizedLocator = unit.locator.trim()
    if (normalizedLocator.length === 0) throw new Error('unit locator cannot be empty')
    return {
      locator: normalizedLocator,
      file,
      chunk_ids: sortedUnique(unit.chunkIds),
      content_hash: contentHash(unit.body),
      ...(images != null && images.length > 0 ? { images } : {}),
    }
  })

  return {
    manifest_version: 1,
    source_id: sourceId,
    title: input.title,
    doc_kind: input.docKind,
    ...(input.brand != null ? { brand: input.brand } : {}),
    ...(input.productLine != null ? { product_line: input.productLine } : {}),
    ...(input.year != null ? { year: input.year } : {}),
    ...(input.distributorBranded != null ? { distributor_branded: input.distributorBranded } : {}),
    has_full_text: hasFullText,
    ...(hasFullText ? { full_text_file: 'full.txt' } : {}),
    units,
  }
}

export async function writeExtractArtifact(input: WriteExtractArtifactInput): Promise<{ outputDir: string; manifest: ExtractManifest }> {
  const manifest = buildExtractManifest(input)
  const extractsRoot = path.join(input.repoRoot, 'kb_extracts')
  const stagingRoot = path.join(extractsRoot, '.staging')
  const stagingDir = path.join(stagingRoot, manifest.source_id)
  const outputDir = path.join(extractsRoot, manifest.source_id)

  await rm(stagingDir, { recursive: true, force: true })
  await mkdir(stagingDir, { recursive: true })

  for (const [index, unit] of input.units.entries()) {
    const relativeFile = safeRelativePath(unit.fileName)
    const targetFile = path.join(stagingDir, relativeFile)
    await mkdir(path.dirname(targetFile), { recursive: true })
    await writeFile(targetFile, unit.body, 'utf8')

    const images = unit.images ?? []
    for (const imagePath of images) {
      const relativeImage = safeRelativePath(imagePath)
      const targetImage = path.join(stagingDir, relativeImage)
      await mkdir(path.dirname(targetImage), { recursive: true })
      await writeFile(targetImage, '', 'utf8')
    }

    if (manifest.units[index] == null) {
      throw new Error('manifest generation mismatch for unit index')
    }
  }

  if (manifest.has_full_text) {
    const fullText = input.units.map((unit) => unit.body).join('\n\n')
    await writeFile(path.join(stagingDir, 'full.txt'), fullText, 'utf8')
  }

  await writeFile(path.join(stagingDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await rm(outputDir, { recursive: true, force: true })
  await rename(stagingDir, outputDir)

  return { outputDir, manifest }
}
