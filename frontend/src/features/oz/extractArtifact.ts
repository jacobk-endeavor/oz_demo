import { createHash } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { tabularFromText } from './knowledgeBaseTabular'
import { extractPdfUnits, type PdfExtractNeedsOcr, type PdfPageTextExtractor } from './pdfExtractor'

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

export type PptxSlideInput = {
  slideNumber: number
  chunkIds: string[]
  title?: string
  bodyText?: string | string[]
  speakerNotes?: string | string[]
  visualHeavy?: boolean
  imageFileName?: string
}

export type WritePptxExtractArtifactInput = {
  repoRoot: string
  sourceId: string
  title: string
  slides: PptxSlideInput[]
  brand?: string
  productLine?: string
  year?: number
  distributorBranded?: boolean
}

export type BuildExcelExtractUnitsInput = {
  sourceId: string
  workbook: ArrayBuffer | Uint8Array
  rowChunkSize?: number
}

export type BuildExcelExtractUnitsResult = {
  units: ExtractUnitInput[]
  sheetCount: number
  failedSheets: string[]
}

export type WriteExcelExtractArtifactInput = {
  repoRoot: string
  sourceId: string
  title: string
  workbook: ArrayBuffer | Uint8Array
  docKind?: ExtractDocKind
  rowChunkSize?: number
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
const DEFAULT_EXCEL_BODY_ROWS_PER_CHUNK = 20

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

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

function normalizeTextPart(part: string | string[] | undefined): string {
  if (part == null) return ''
  const pieces = Array.isArray(part) ? part : [part]
  return pieces.map((line) => line.trim()).filter((line) => line.length > 0).join('\n')
}

function buildPptxSlideBody(sourceTitle: string, slide: PptxSlideInput): string {
  const sections = [
    normalizeTextPart(slide.title),
    normalizeTextPart(slide.bodyText),
    normalizeTextPart(slide.speakerNotes),
  ].filter((part) => part.length > 0)
  const content = sections.join('\n\n')
  return `[source=${sourceTitle}][slide=${slide.slideNumber}]\n\n${content}`.trim()
}

export function buildPptxExtractUnits(sourceTitle: string, slides: PptxSlideInput[]): ExtractUnitInput[] {
  return [...slides]
    .sort((a, b) => a.slideNumber - b.slideNumber)
    .map((slide) => {
      if (!Number.isInteger(slide.slideNumber) || slide.slideNumber <= 0) {
        throw new Error(`invalid slide number: ${slide.slideNumber}`)
      }
      const index = pad3(slide.slideNumber)
      const images =
        slide.visualHeavy === true
          ? [slide.imageFileName?.trim() || `img/slide-${index}.png`]
          : undefined
      return {
        locator: `slide=${slide.slideNumber}`,
        fileName: `unit-slide-${index}.txt`,
        body: buildPptxSlideBody(sourceTitle, slide),
        chunkIds: slide.chunkIds,
        ...(images != null ? { images } : {}),
      }
    })
}

function slugifySheetName(sheetName: string): string {
  const slug = sheetName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'sheet'
}

function csvEscapeCell(cell: string): string {
  if (!/[",\n]/.test(cell)) return cell
  return `"${cell.replaceAll('"', '""')}"`
}

function rowToCsv(row: string[]): string {
  return row.map(csvEscapeCell).join(',')
}

function padRow(row: string[], width: number): string[] {
  const out = [...row]
  while (out.length < width) out.push('')
  return out
}

export function buildExcelExtractUnits(input: BuildExcelExtractUnitsInput): BuildExcelExtractUnitsResult {
  const sourceId = normalizeSourceId(input.sourceId)
  const rowChunkSize = input.rowChunkSize ?? DEFAULT_EXCEL_BODY_ROWS_PER_CHUNK
  if (!Number.isInteger(rowChunkSize) || rowChunkSize < 1) {
    throw new Error('rowChunkSize must be a positive integer')
  }

  const workbookData = input.workbook instanceof Uint8Array ? input.workbook : new Uint8Array(input.workbook)
  const workbook = XLSX.read(workbookData, { type: 'array' })
  const units: ExtractUnitInput[] = []
  const failedSheets: string[] = []

  for (const sheetName of workbook.SheetNames) {
    try {
      const sheet = workbook.Sheets[sheetName]
      if (sheet == null) {
        failedSheets.push(sheetName)
        continue
      }

      // Keep extraction format aligned with UI preview: sheet -> CSV -> table parser.
      const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ',' })
      const table = tabularFromText(`${sheetName}.csv`, csv)
      const headers = table.headers.length > 0 ? table.headers : ['Column 1']
      const headerLine = rowToCsv(headers)
      const width = headers.length
      const sheetSlug = slugifySheetName(sheetName)

      for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += rowChunkSize) {
        const start = rowIndex + 1
        const end = Math.min(rowIndex + rowChunkSize, table.rows.length)
        const bodyRows = table.rows.slice(rowIndex, end).map((row) => rowToCsv(padRow(row, width)))
        const body = [headerLine, ...bodyRows].join('\n')
        const rangeSuffix = `r${String(start).padStart(5, '0')}_${String(end).padStart(5, '0')}`
        units.push({
          locator: `sheet=${sheetName} rows=${start}-${end}`,
          fileName: `unit-sheet-${sheetSlug}-${rangeSuffix}.csv`,
          body,
          chunkIds: [`${sourceId}_${sheetSlug}_${rangeSuffix}`],
        })
      }
    } catch {
      failedSheets.push(sheetName)
    }
  }

  return { units, sheetCount: workbook.SheetNames.length, failedSheets }
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

export type WritePdfExtractArtifactInput = Omit<WriteExtractArtifactInput, 'units'> & {
  pdfBytes: Uint8Array
  primaryExtractor: PdfPageTextExtractor
  fallbackExtractor: PdfPageTextExtractor
  minAvgCharsPerPage?: number
}

export type WritePdfExtractArtifactResult =
  | { status: 'ok'; outputDir: string; manifest: ExtractManifest; pageCount: number; extractor: 'pypdf' | 'pdfminer' }
  | PdfExtractNeedsOcr

/**
 * Track A PDF path:
 * - pypdf primary
 * - pdfminer fallback when extracted text is too sparse
 * - per-page units in kb_extracts/<source_id>/unit-page-<n>.txt
 * - image-only PDFs signal `needs_ocr` for caller to mark source as failed
 */
export async function writePdfExtractArtifact(input: WritePdfExtractArtifactInput): Promise<WritePdfExtractArtifactResult> {
  const extracted = await extractPdfUnits({
    pdfBytes: input.pdfBytes,
    primaryExtractor: input.primaryExtractor,
    fallbackExtractor: input.fallbackExtractor,
    minAvgCharsPerPage: input.minAvgCharsPerPage,
  })
  if (extracted.status !== 'ok') {
    return extracted
  }
  const { outputDir, manifest } = await writeExtractArtifact({
    repoRoot: input.repoRoot,
    sourceId: input.sourceId,
    title: input.title,
    docKind: input.docKind,
    units: extracted.units,
    brand: input.brand,
    productLine: input.productLine,
    year: input.year,
    distributorBranded: input.distributorBranded,
  })
  return {
    status: 'ok',
    outputDir,
    manifest,
    pageCount: extracted.pageCount,
    extractor: extracted.extractor,
  }
}

export async function writeExcelExtractArtifact(
  input: WriteExcelExtractArtifactInput,
): Promise<{
  outputDir: string
  manifest: ExtractManifest
  sheetCount: number
  failedSheets: string[]
}> {
  const { units, sheetCount, failedSheets } = buildExcelExtractUnits({
    sourceId: input.sourceId,
    workbook: input.workbook,
    rowChunkSize: input.rowChunkSize,
  })
  const result = await writeExtractArtifact({
    repoRoot: input.repoRoot,
    sourceId: input.sourceId,
    title: input.title,
    docKind: input.docKind ?? 'tabular-reference',
    units,
    brand: input.brand,
    productLine: input.productLine,
    year: input.year,
    distributorBranded: input.distributorBranded,
  })
  return { ...result, sheetCount, failedSheets }
}

export async function writePptxExtractArtifact(
  input: WritePptxExtractArtifactInput,
): Promise<{ outputDir: string; manifest: ExtractManifest }> {
  return writeExtractArtifact({
    repoRoot: input.repoRoot,
    sourceId: input.sourceId,
    title: input.title,
    docKind: 'presentation',
    units: buildPptxExtractUnits(input.title, input.slides),
    ...(input.brand != null ? { brand: input.brand } : {}),
    ...(input.productLine != null ? { productLine: input.productLine } : {}),
    ...(input.year != null ? { year: input.year } : {}),
    ...(input.distributorBranded != null ? { distributorBranded: input.distributorBranded } : {}),
  })
}
