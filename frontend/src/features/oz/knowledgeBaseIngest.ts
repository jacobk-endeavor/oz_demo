import * as XLSX from 'xlsx'
import { tabularFromText, type TabularResult } from './knowledgeBaseTabular'

/** First N bytes of a workbook to read in-browser (larger files are previewed from this prefix only). */
export const KNOWLEDGE_EXCEL_MAX_BYTES = 5 * 1024 * 1024
export const KNOWLEDGE_PDF_MAX_BYTES = 15 * 1024 * 1024
export const KNOWLEDGE_IMAGE_MAX_BYTES = 25 * 1024 * 1024
export const KNOWLEDGE_PDF_MAX_PAGE_RENDER = 40

const EXCEL_LIKE = new Set(['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods'])

function fileExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export type KnowledgeAssetKind = 'text' | 'image' | 'pdf' | 'excel' | 'pptx'

/**
 * How to show this file: spreadsheet → excel; else routing by type / extension.
 */
export function classifyKnowledgeFile(file: File): KnowledgeAssetKind {
  const t = (file.type || '').toLowerCase()
  const e = fileExt(file.name)
  if (
    t === 'application/pdf' ||
    e === '.pdf' ||
    t === 'application/x-pdf'
  ) {
    return 'pdf'
  }
  if (t === 'image/svg+xml' || t.startsWith('image/') || e === '.svg' || e === '.ico' || e === '.bmp' || e === '.png' || e === '.jpg' || e === '.jpeg' || e === '.gif' || e === '.webp' || e === '.tiff' || e === '.tif' || e === '.avif' || e === '.heic' || e === '.heif') {
    return 'image'
  }
  if (
    t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    t === 'application/vnd.ms-excel' ||
    t === 'application/vnd.ms-excel.sheet.macroEnabled.12' ||
    t === 'application/vnd.oasis.opendocument.spreadsheet' ||
    t.includes('spreadsheet') ||
    EXCEL_LIKE.has(e)
  ) {
    return 'excel'
  }
  if (e === '.pdf') return 'pdf'
  if (e === '.pptx' || t.includes('presentationml') || t.includes('powerpoint')) return 'pptx'
  return 'text'
}

/**
 * Build a table from the first worksheet: export to CSV, then use the same CSV
 * table pipeline as a plain .csv file (row cap, quoted fields, etc.).
 */
function workbookFirstSheetToTableViaCsv(wb: XLSX.WorkBook): { table: TabularResult; sheetName: string } {
  const sheetName = wb.SheetNames[0] ?? 'Sheet1'
  const sheet = wb.Sheets[sheetName]!
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ',' })
  const table = tabularFromText(`${sheetName}.csv`, csv)
  return { table, sheetName }
}

export function isLikelyPasswordOrEncryptionError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /password|protected|encrypted|extensible|agile|decrypt|cipher|FilePass|verifier/i.test(msg)
}

export function isUnrecoverableExtensibleError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /ECMA-376 Extensible/i.test(msg)
}

export type ParseExcelResult =
  | { type: 'table'; table: TabularResult; sheetName: string }
  | { type: 'need_password' }
  | { type: 'error'; message: string }

/**
 * @param password — `undefined` on first read; if encryption needs a user password, re-call with a string.
 */
export function parseExcelArrayBuffer(
  data: ArrayBuffer,
  password: string | undefined,
): ParseExcelResult {
  try {
    const opts: { type: 'array'; password?: string } = { type: 'array' }
    if (password != null && password.length > 0) opts.password = password
    const wb = XLSX.read(data, opts)
    const { table, sheetName } = workbookFirstSheetToTableViaCsv(wb)
    return { type: 'table', table, sheetName }
  } catch (e) {
    if (isUnrecoverableExtensibleError(e)) {
      return {
        type: 'error',
        message:
          'This workbook uses a newer encryption (ECMA-376 “Extensible”) that this browser build cannot open. Re-save from Excel as an XLSX with standard “password to open” or unprotect, then add again.',
      }
    }
    if (password == null && isLikelyPasswordOrEncryptionError(e)) {
      return { type: 'need_password' }
    }
    const msg = e instanceof Error ? e.message : 'Could not read this spreadsheet'
    if (password != null) {
      return { type: 'error', message: `Could not open with that password. ${msg}` }
    }
    return { type: 'error', message: msg }
  }
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '')
    r.onerror = () => reject(new Error('Read failed'))
    r.readAsText(file, 'UTF-8')
  })
}

function readFileAsArrayBuffer(file: File, maxBytes?: number): Promise<ArrayBuffer> {
  const toRead = maxBytes != null && file.size > maxBytes ? file.slice(0, maxBytes) : file
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const res = r.result
      if (res instanceof ArrayBuffer) resolve(res)
      else resolve(new ArrayBuffer(0))
    }
    r.onerror = () => reject(new Error('Read failed'))
    r.readAsArrayBuffer(toRead)
  })
}

export type ProcessedKnowledgePreview =
  | {
      kind: 'table'
      table: TabularResult
      sheetName?: string
      /** When the source file is larger than `KNOWLEDGE_EXCEL_MAX_BYTES`, we only read that many bytes. */
      excelReadTruncated?: boolean
      excelTotalBytes?: number
    }
  | { kind: 'image'; objectUrl: string; mime: string; fileName: string }
  | { kind: 'pdf'; objectUrl: string; fileName: string }

export type ProcessedKnowledgeResult =
  | { type: 'ready'; preview: ProcessedKnowledgePreview; revoke: () => void }
  | { type: 'password_required' }
  | { type: 'error'; message: string }

/**
 * Ingests one file. For Excel, call again with the same `File` and `parseExcelArrayBuffer` + password after
 * `password_required`.
 */
export async function processKnowledgeFile(
  file: File,
  opts: { kind: KnowledgeAssetKind; password?: string },
): Promise<ProcessedKnowledgeResult> {
  if (opts.kind === 'pptx') {
    return {
      type: 'ready',
      preview: {
        kind: 'table',
        table: tabularFromText(
          file.name,
          'PowerPoint\n\nIn-browser preview is not extracted. The dev server will run slide text ingest when you commit to the knowledge base.',
        ),
      },
      revoke: () => {},
    }
  }
  if (opts.kind === 'image') {
    if (file.size > KNOWLEDGE_IMAGE_MAX_BYTES) {
      return { type: 'error', message: `Image is too large (max ${formatMb(KNOWLEDGE_IMAGE_MAX_BYTES)}).` }
    }
    const objectUrl = URL.createObjectURL(file)
    return {
      type: 'ready',
      preview: { kind: 'image', objectUrl, mime: file.type || 'application/octet-stream', fileName: file.name },
      revoke: () => URL.revokeObjectURL(objectUrl),
    }
  }
  if (opts.kind === 'pdf') {
    if (file.size > KNOWLEDGE_PDF_MAX_BYTES) {
      return { type: 'error', message: `PDF is too large (max ${formatMb(KNOWLEDGE_PDF_MAX_BYTES)}).` }
    }
    const objectUrl = URL.createObjectURL(file)
    return {
      type: 'ready',
      preview: { kind: 'pdf', objectUrl, fileName: file.name },
      revoke: () => URL.revokeObjectURL(objectUrl),
    }
  }
  if (opts.kind === 'excel') {
    const ab = await readFileAsArrayBuffer(file, KNOWLEDGE_EXCEL_MAX_BYTES)
    const truncated = file.size > KNOWLEDGE_EXCEL_MAX_BYTES
    const r = parseExcelArrayBuffer(ab, opts.password)
    if (r.type === 'need_password') {
      return { type: 'password_required' }
    }
    if (r.type === 'error') {
      return { type: 'error', message: r.message }
    }
    return {
      type: 'ready',
      preview: {
        kind: 'table',
        table: r.table,
        sheetName: r.sheetName,
        excelReadTruncated: truncated,
        excelTotalBytes: file.size,
      },
      revoke: () => {},
    }
  }
  // text
  const text = await readFileAsText(file)
  const table = tabularFromText(file.name, text)
  return { type: 'ready', preview: { kind: 'table', table }, revoke: () => {} }
}

function formatMb(n: number) {
  return `${(n / (1024 * 1024)).toFixed(0)}MB`
}
