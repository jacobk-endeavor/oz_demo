import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
  type InputHTMLAttributes,
} from 'react'
import { joinClasses } from '../../shared/ui'
import { PlusIcon, FolderOpenIcon, ChevronRightIcon, CloseIcon, TrashIcon } from '../../shared/ui/icons'
import {
  classifyKnowledgeFile,
  processKnowledgeFile,
  KNOWLEDGE_EXCEL_MAX_BYTES,
  KNOWLEDGE_IMAGE_MAX_BYTES,
  KNOWLEDGE_PDF_MAX_BYTES,
  type KnowledgeAssetKind,
  type ProcessedKnowledgePreview,
  type ProcessedKnowledgeResult,
} from './knowledgeBaseIngest'
import { tabularFromText, type TabularResult } from './knowledgeBaseTabular'

const KnowledgeBasePdfView = lazy(() => import('./KnowledgeBasePdfView'))

const PREVIEW_MAX_COLS = 64
const PREVIEW_MAX_BODY_ROWS = 500

const KB_SERVER_INGEST_PATH = '/api/oz/knowledge-base/ingest'

type IngestState = 'staged' | 'processing' | 'ready' | 'uploading' | 'ingested' | 'failed'

type KbListEntry =
  | {
      id: string
      entryKind: 'file'
      displayName: string
      file: File
      sizeLabel: string
      kind: KnowledgeAssetKind
      ingest: IngestState
      preview: ProcessedKnowledgePreview | null
      revokeObjectUrl: () => void
      /** Set after successful server ingest (sha-based source id). */
      sourceId?: string
      errorMessage?: string
      /** Present when pgvector ingest succeeded but wiki scaffold reported an error. */
      wikiWarning?: string
      /** Present when wiki scaffold was intentionally skipped (unchanged file or missing kb_extracts bundle). */
      wikiNote?: string
      /** Present when cloud pgvector ingest failed but upload/local wiki may have succeeded. */
      pgvectorNote?: string
    }
  | {
      id: string
      entryKind: 'folder'
      displayName: string
      sizeLabel: string
      ingest: 'staged' | 'ingested'
      revokeObjectUrl: () => void
    }

type LibraryView = 'ingested' | 'queue' | 'all'

function nextId() {
  return `kb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function noopRevoke() {}

function folderNameFromDirectoryPicker(fileList: FileList | null): string | null {
  if (!fileList || fileList.length === 0) return null
  const f = fileList[0]! as File & { webkitRelativePath?: string }
  const p = f.webkitRelativePath
  if (p == null || p.length === 0) return f.name
  const seg = p.split('/')[0]!
  return seg.length > 0 ? seg : f.name
}

type TypeBucket = 'folder' | 'excel' | 'pdf' | 'pptx' | 'image' | 'text'

function typeBucketForEntry(e: KbListEntry): TypeBucket {
  if (e.entryKind === 'folder') return 'folder'
  if (e.kind === 'pdf') return 'pdf'
  if (e.kind === 'pptx') return 'pptx'
  if (e.kind === 'image') return 'image'
  if (e.kind === 'excel') return 'excel'
  return 'text'
}

const TYPE_ORDER: TypeBucket[] = ['folder', 'excel', 'pdf', 'pptx', 'image', 'text']
const typeLabel: Record<TypeBucket, string> = {
  folder: 'Folder',
  excel: 'Excel / sheet',
  pdf: 'PDF',
  pptx: 'PowerPoint',
  image: 'Image',
  text: 'Text / other',
}

function typeSortValue(b: TypeBucket) {
  return TYPE_ORDER.indexOf(b)
}

type SortBy = 'type' | 'name' | 'status'

function ingestRank(e: KbListEntry): number {
  if (e.entryKind === 'folder') {
    return e.ingest === 'staged' ? 0 : 3
  }
  const m: Record<IngestState, number> = {
    staged: 0,
    processing: 1,
    ready: 2,
    uploading: 2,
    failed: 2,
    ingested: 3,
  }
  return m[e.ingest]
}

function isIngested(e: KbListEntry): boolean {
  return e.entryKind === 'folder' ? e.ingest === 'ingested' : e.ingest === 'ingested'
}

function isInQueue(e: KbListEntry): boolean {
  if (e.entryKind === 'folder') return e.ingest === 'staged'
  return (
    e.ingest === 'staged' ||
    e.ingest === 'processing' ||
    e.ingest === 'ready' ||
    e.ingest === 'uploading' ||
    e.ingest === 'failed'
  )
}

function statusLabel(e: KbListEntry): string {
  if (e.entryKind === 'folder') {
    return e.ingest === 'staged' ? 'Staged' : 'Ingested'
  }
  switch (e.ingest) {
    case 'staged':
      return 'Staged'
    case 'processing':
      return 'Processing local preview'
    case 'ready':
      return 'Ready'
    case 'uploading':
      return 'Uploading to server…'
    case 'failed': {
      const m = e.errorMessage ?? 'Unknown error'
      return m.length > 56 ? `Failed — ${m.slice(0, 52)}…` : `Failed — ${m}`
    }
    case 'ingested':
      return e.sourceId ? `Ingested (${e.sourceId})` : 'Ingested'
  }
}

function demoNormalizeProcessResult(
  file: File,
  result: ProcessedKnowledgeResult,
): { preview: ProcessedKnowledgePreview; revoke: () => void } {
  if (result.type === 'ready') {
    return { preview: result.preview, revoke: result.revoke }
  }
  const note =
    result.type === 'password_required'
      ? 'This file is ready for the demo. (A password can be used in a full import flow.)'
      : `This file is ready for the demo. (${result.message})`
  return {
    preview: { kind: 'table', table: tabularFromText(file.name, `Demo\n\n${note}`) },
    revoke: noopRevoke,
  }
}

function maxColCount(table: TabularResult): number {
  let m = table.headers.length
  const cap = table.rows.length
  for (let i = 0; i < cap; i++) {
    const n = table.rows[i]!.length
    if (n > m) m = n
  }
  return Math.max(1, m)
}

function TablePreviewView({
  table,
  sheetName,
  excelReadTruncated,
}: {
  table: TabularResult
  sheetName?: string
  excelReadTruncated?: boolean
}) {
  const fullCols = maxColCount(table)
  const cols = Math.min(PREVIEW_MAX_COLS, fullCols)
  const rowCount = table.rows.length
  const showRows = table.rows.length > PREVIEW_MAX_BODY_ROWS ? table.rows.slice(0, PREVIEW_MAX_BODY_ROWS) : table.rows
  const widthTrunc = fullCols > PREVIEW_MAX_COLS
  const heightTrunc = rowCount > PREVIEW_MAX_BODY_ROWS
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {sheetName != null && sheetName.length > 0 && (
        <p className="shrink-0 text-xs text-zinc-500">
          <span className="font-medium text-zinc-700">Sheet</span> {sheetName}
        </p>
      )}
      {excelReadTruncated && (
        <p className="shrink-0 text-[11px] text-amber-800">
          Only the first segment of a larger file was read (demo). The full spreadsheet may be longer.
        </p>
      )}
      {(widthTrunc || heightTrunc) && (
        <p className="shrink-0 text-[11px] text-zinc-500">
          {widthTrunc && `Showing first ${cols} of ${fullCols} columns. `}
          {heightTrunc && `Showing first ${showRows.length} of ${rowCount} rows in the preview.`}
        </p>
      )}
      <div className="mt-1 inline-block min-w-full max-w-full rounded-lg border border-zinc-200 bg-zinc-50/40">
        <table className="w-full min-w-0 border-collapse text-left text-xs text-zinc-800">
          <thead>
            <tr className="bg-zinc-100/90">
              <th
                className="sticky left-0 z-10 w-9 border-b border-r border-zinc-200/90 bg-zinc-100/95 px-1 py-1 text-right font-medium text-zinc-500"
                scope="col"
              >
                #
              </th>
              {Array.from({ length: cols }, (_, i) => (
                <th
                  key={i}
                  className="min-w-[4.5rem] max-w-[14rem] border-b border-zinc-200/90 px-1.5 py-1 font-medium break-words text-zinc-800"
                  scope="col"
                >
                  {table.headers[i] ?? `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showRows.map((row, ri) => (
              <tr key={ri} className="hover:bg-white/60">
                <th
                  className="sticky left-0 z-10 w-9 border-b border-r border-zinc-200/80 bg-zinc-50/95 py-0.5 pr-1 pl-0.5 text-right font-medium text-zinc-400"
                  scope="row"
                >
                  {ri + 1}
                </th>
                {Array.from({ length: cols }, (_, ci) => (
                  <td
                    key={ci}
                    className="max-w-[14rem] border-b border-zinc-200/70 px-1.5 py-0.5 align-top break-words"
                  >
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PreviewBody({ preview, fileName }: { preview: ProcessedKnowledgePreview; fileName: string }) {
  if (preview.kind === 'table') {
    return (
      <TablePreviewView
        table={preview.table}
        sheetName={preview.sheetName}
        excelReadTruncated={preview.excelReadTruncated}
      />
    )
  }
  if (preview.kind === 'image') {
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-2">
        <img
          src={preview.objectUrl}
          alt={preview.fileName}
          className="max-h-[min(100%,32rem)] w-auto max-w-full rounded border border-zinc-200"
        />
      </div>
    )
  }
  return (
    <div className="flex min-h-0 min-h-[12rem] w-full min-w-0 flex-1 flex-col p-0">
      <Suspense
        fallback={<div className="p-4 text-sm text-zinc-500">Loading PDF viewer…</div>}
      >
        <KnowledgeBasePdfView fileUrl={preview.objectUrl} fileName={fileName || preview.fileName} />
      </Suspense>
    </div>
  )
}

function PanelFrame({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <aside
      className="flex h-full min-h-0 w-full min-w-0 max-w-md shrink-0 flex-col border-l border-zinc-200 bg-white shadow-sm md:max-w-[min(100%,24rem)] lg:max-w-[min(100%,32rem)]"
      data-testid="knowledge-preview-panel"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-3 py-2">
        <h2 className="min-w-0 truncate pr-2 text-sm font-semibold text-zinc-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200/80 hover:text-zinc-800"
          aria-label="Close preview"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2">{children}</div>
    </aside>
  )
}

type KbFileRow = Extract<KbListEntry, { entryKind: 'file' }>

export function KnowledgeBasePage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<KbListEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [libraryView, setLibraryView] = useState<LibraryView>('ingested')
  const [sortBy, setSortBy] = useState<SortBy>('type')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  /** When on, server ingest uses --reembed so kb_extracts + wiki scaffold always run (slower; for testing the full path). */
  const [wikiFullPath, setWikiFullPath] = useState(false)
  const filesForUnmountRef = useRef<KbListEntry[]>([])
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  useEffect(() => {
    filesForUnmountRef.current = rows
  }, [rows])

  const setEntry = useCallback((id: string, next: (e: KbFileRow) => KbFileRow) => {
    setRows((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        if (e.entryKind === 'folder') return e
        e.revokeObjectUrl()
        return next(e)
      }),
    )
  }, [])

  const setFolderIngest = useCallback((id: string, ingest: 'staged' | 'ingested') => {
    setRows((prev) =>
      prev.map((e) => (e.id === id && e.entryKind === 'folder' ? { ...e, ingest } : e)),
    )
  }, [])

  const runServerIngest = useCallback(async (id: string, file: File) => {
    setRows((prev) =>
      prev.map((e) =>
        e.id === id && e.entryKind === 'file' ? { ...e, ingest: 'uploading' as const } : e,
      ),
    )
    try {
      const buf = await file.arrayBuffer()
      const res = await fetch(KB_SERVER_INGEST_PATH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
          ...(wikiFullPath ? { 'X-Oz-Kb-Wiki-Full': '1' } : {}),
        },
        body: buf,
      })
      const raw = await res.text()
      let parsed: {
        ok?: boolean
        source_id?: string
        error?: string
        detail?: string
        hint?: string
        wiki?: { ok?: boolean; detail?: string; skipped?: boolean }
        pgvector?: { ok?: boolean; detail?: string }
      } = {}
      try {
        parsed = JSON.parse(raw) as typeof parsed
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        const baseErr = parsed.detail || parsed.error || raw || res.statusText || 'Server ingest failed'
        const errLine =
          typeof parsed.hint === 'string' && parsed.hint.length > 0
            ? `${baseErr}\n${parsed.hint}`
            : baseErr
        setRows((prev) =>
          prev.map((e) =>
            e.id === id && e.entryKind === 'file'
              ? { ...e, ingest: 'failed' as const, errorMessage: errLine }
              : e,
          ),
        )
        return
      }
      const wiki = parsed.wiki
      const wikiWarning =
        wiki && wiki.ok === false && typeof wiki.detail === 'string' ? wiki.detail : undefined
      const wikiNote =
        wiki &&
        wiki.ok !== false &&
        wiki.skipped === true &&
        typeof wiki.detail === 'string' &&
        wiki.detail.length > 0
          ? wiki.detail
          : undefined
      const pg = parsed.pgvector
      const pgvectorNote =
        pg && pg.ok === false && typeof pg.detail === 'string' && pg.detail.length > 0
          ? pg.detail
          : undefined
      setRows((prev) =>
        prev.map((e) =>
          e.id === id && e.entryKind === 'file'
            ? {
                ...e,
                ingest: 'ingested' as const,
                sourceId: typeof parsed.source_id === 'string' ? parsed.source_id : undefined,
                wikiWarning,
                wikiNote,
                pgvectorNote,
              }
            : e,
        ),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setRows((prev) =>
        prev.map((e) =>
          e.id === id && e.entryKind === 'file'
            ? { ...e, ingest: 'failed' as const, errorMessage: msg }
            : e,
        ),
      )
    }
  }, [wikiFullPath])

  const loadFilePreview = useCallback(
    async (id: string, file: File, kind: KnowledgeAssetKind) => {
      setEntry(id, (e) => ({ ...e, ingest: 'processing' }))
      try {
        const result = await processKnowledgeFile(file, { kind })
        const { preview, revoke } = demoNormalizeProcessResult(file, result)
        setEntry(id, (e) => ({
          ...e,
          ingest: 'ready' as const,
          preview,
          revokeObjectUrl: revoke,
        }))
        void runServerIngest(id, file)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not process file'
        const { preview, revoke } = demoNormalizeProcessResult(file, {
          type: 'error',
          message: msg,
        })
        setEntry(id, (e) => ({
          ...e,
          ingest: 'ready' as const,
          preview,
          revokeObjectUrl: revoke,
        }))
        void runServerIngest(id, file)
      }
    },
    [setEntry, runServerIngest],
  )

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const newRows: KbListEntry[] = []
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i]!
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath
        const displayName = path && path.length > 0 ? path : file.name
        const kind = classifyKnowledgeFile(file)
        const id = nextId()
        newRows.push({
          id,
          entryKind: 'file',
          file,
          displayName,
          sizeLabel: formatSize(file.size),
          kind,
          ingest: 'staged',
          preview: null,
          revokeObjectUrl: noopRevoke,
        })
      }
      setRows((prev) => [...newRows, ...prev])
      for (const r of newRows) {
        if (r.entryKind === 'file') {
          void loadFilePreview(r.id, r.file, r.kind)
        }
      }
      setAddModalOpen(false)
    },
    [loadFilePreview],
  )

  const addFolder = useCallback(
    (fileList: FileList | null) => {
      const name = folderNameFromDirectoryPicker(fileList)
      if (name == null) return
      const id = nextId()
      setRows((prev) => [
        {
          id,
          entryKind: 'folder',
          displayName: name,
          sizeLabel: 'Folder',
          ingest: 'staged',
          revokeObjectUrl: noopRevoke,
        },
        ...prev,
      ])
      const folderIngestMs = Math.round(1600 + Math.random() * 2400)
      window.setTimeout(() => {
        if (!rowsRef.current.some((e) => e.id === id && e.entryKind === 'folder' && e.ingest === 'staged')) {
          return
        }
        setFolderIngest(id, 'ingested')
      }, folderIngestMs)
      setAddModalOpen(false)
    },
    [setFolderIngest],
  )

  const deleteById = useCallback(
    (id: string) => {
      setRows((prev) => {
        const target = prev.find((e) => e.id === id)
        if (target) target.revokeObjectUrl()
        return prev.filter((e) => e.id !== id)
      })
      setSelectedId((s) => (s === id ? null : s))
    },
    [],
  )

  const displayedRows = useMemo(() => {
    let list = rows.filter((e) => {
      if (libraryView === 'ingested') return isIngested(e)
      if (libraryView === 'queue') return isInQueue(e)
      return true
    })
    const sign = sortDir === 'asc' ? 1 : -1
    list = [...list].sort((a, b) => {
      if (libraryView === 'all') {
        const ra = ingestRank(a)
        const rb = ingestRank(b)
        if (ra !== rb) return sign * (ra - rb)
      }
      if (sortBy === 'name') {
        return sign * a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
      }
      if (sortBy === 'type') {
        const ta = typeSortValue(typeBucketForEntry(a))
        const tb = typeSortValue(typeBucketForEntry(b))
        if (ta !== tb) return sign * (ta - tb)
        return sign * a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
      }
      return sign * statusLabel(a).localeCompare(statusLabel(b), undefined, { sensitivity: 'base' })
    })
    return list
  }, [rows, libraryView, sortBy, sortDir])

  const closePanel = useCallback(() => {
    setSelectedId(null)
  }, [])

  useEffect(
    () => () => {
      for (const f of filesForUnmountRef.current) {
        f.revokeObjectUrl()
      }
    },
    [],
  )

  const renderPanel = () => {
    if (selectedId == null) return null
    const row = rows.find((r) => r.id === selectedId)
    if (!row) return null

    if (row.entryKind === 'folder') {
      return (
        <PanelFrame title={row.displayName} onClose={closePanel}>
          <p className="text-sm text-zinc-600">Folder — contents are not listed in the demo list.</p>
        </PanelFrame>
      )
    }

    if (row.preview == null) {
      return (
        <PanelFrame title={row.displayName} onClose={closePanel}>
          <p className="text-sm text-zinc-500">Loading preview…</p>
        </PanelFrame>
      )
    }
    return (
      <PanelFrame title={row.displayName} onClose={closePanel}>
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          {row.wikiWarning != null && row.wikiWarning.length > 0 ? (
            <p className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
              Wiki scaffold warning (chunks are still in pgvector): {row.wikiWarning}
            </p>
          ) : null}
          {row.wikiNote != null && row.wikiNote.length > 0 ? (
            <p className="shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-800">
              Wiki scaffold skipped: {row.wikiNote}
            </p>
          ) : null}
          {row.pgvectorNote != null && row.pgvectorNote.length > 0 ? (
            <p className="shrink-0 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-950">
              Cloud pgvector ingest failed (local kb_extracts/wiki may still be OK): {row.pgvectorNote}
            </p>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PreviewBody preview={row.preview} fileName={row.displayName} />
          </div>
        </div>
      </PanelFrame>
    )
  }

  const trClass = (e: KbListEntry) => {
    const inQueue = isInQueue(e) || (e.entryKind === 'file' && e.ingest === 'staged')
    return joinClasses(
      'group cursor-pointer border-b border-zinc-100',
      inQueue && e.entryKind === 'file' && e.ingest === 'staged' ? 'bg-amber-50/70' : '',
      inQueue && e.entryKind === 'file' && (e.ingest === 'processing' || e.ingest === 'ready' || e.ingest === 'uploading')
        ? 'bg-sky-50/50'
        : '',
      e.entryKind === 'file' && e.ingest === 'failed' ? 'bg-rose-50/40' : '',
      e.entryKind === 'folder' && e.ingest === 'staged' ? 'bg-amber-50/50' : '',
      selectedId === e.id ? 'ring-1 ring-inset ring-sky-300' : 'hover:bg-zinc-50/80',
    )
  }

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4"
      data-testid="knowledge-base-page"
    >
      <h1 className="sr-only">Knowledge Base</h1>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
        >
          <PlusIcon className="h-4 w-4" aria-hidden />
          Add
        </button>
        <label className="flex max-w-[min(100%,18rem)] cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50/90 px-2.5 py-1.5 text-xs text-zinc-700">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
            checked={wikiFullPath}
            onChange={(e) => setWikiFullPath(e.target.checked)}
          />
          <span>
            <span className="font-medium text-zinc-900">Wiki + extracts (full path)</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-zinc-600">
              On: force <code className="rounded bg-zinc-200/80 px-0.5">kb_extracts</code> + wiki draft (re-embed). Off: default ingest; PDF preview still lazy-loads.
            </span>
          </span>
        </label>
        {addModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onClick={() => setAddModalOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
              role="dialog"
              aria-labelledby="kb-add-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="kb-add-title" className="text-base font-semibold text-zinc-900">
                Add to library
              </h2>
              <p className="mt-1 text-sm text-zinc-600">Choose files or a folder. New items appear at the top of the list.</p>
              <div className="mt-4 flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  {...({ webkitdirectory: '' } as InputHTMLAttributes<HTMLInputElement>)}
                  onChange={(e) => {
                    addFolder(e.target.files)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add files
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800"
                >
                  <FolderOpenIcon className="h-4 w-4 text-zinc-500" />
                  Add folder
                </button>
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="text-sm text-zinc-500 hover:text-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-end gap-2 sm:items-center">
          <div className="flex rounded-lg border border-zinc-200 bg-zinc-50/80 p-0.5 text-xs font-medium text-zinc-600">
            {(['ingested', 'queue', 'all'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setLibraryView(v)}
                className={joinClasses(
                  'rounded-md px-2.5 py-1 transition-colors',
                  libraryView === v ? 'bg-white text-zinc-900 shadow-sm' : 'hover:text-zinc-900',
                )}
              >
                {v === 'ingested' ? 'Ingested' : v === 'queue' ? 'In queue' : 'All'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span className="whitespace-nowrap">Sort by</span>
            <select
              className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
            >
              <option value="type">Type</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span className="whitespace-nowrap">Order</span>
            <select
              className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900"
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden md:flex-row">
        <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="max-h-full overflow-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm text-zinc-800">
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/95 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Name
                  </th>
                  <th scope="col" className="w-36 px-3 py-2">
                    Type
                  </th>
                  <th scope="col" className="w-32 px-3 py-2">
                    Size
                  </th>
                  <th scope="col" className="min-w-[6.5rem] px-3 py-2">
                    Status
                  </th>
                  <th scope="col" className="w-12 px-1 py-2 text-right">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-zinc-400">
                      {libraryView === 'ingested'
                        ? 'Nothing ingested yet. Use Add — each file is previewed locally, then uploaded for pgvector ingest. Enable “Wiki + extracts (full path)” to force kb_extracts + wiki draft in one shot.'
                        : 'No items in this view.'}
                    </td>
                  </tr>
                )}
                {displayedRows.map((e) => {
                  const t = typeBucketForEntry(e)
                  if (e.entryKind === 'folder') {
                    return (
                      <tr
                        key={e.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(e.id)}
                        onKeyDown={(ke) => {
                          if (ke.key === 'Enter' || ke.key === ' ') {
                            ke.preventDefault()
                            setSelectedId(e.id)
                          }
                        }}
                        className={trClass(e)}
                      >
                        <td className="max-w-0 px-3 py-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="line-clamp-2 min-w-0 break-all text-zinc-900">{e.displayName}</span>
                            <span className="shrink-0 text-zinc-300" aria-hidden>
                              <ChevronRightIcon className="h-3.5 w-3.5" />
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-600">{typeLabel[t]}</td>
                        <td className="px-3 py-2 text-zinc-500">—</td>
                        <td className="px-3 py-2 text-zinc-700">{statusLabel(e)}</td>
                        <td className="px-1 py-2 text-right">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              deleteById(e.id)
                            }}
                            className="inline-flex rounded p-1.5 text-zinc-400 opacity-60 transition-opacity group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-700 md:opacity-0"
                            aria-label={`Remove ${e.displayName}`}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(e.id)}
                      onKeyDown={(ke) => {
                        if (ke.key === 'Enter' || ke.key === ' ') {
                          ke.preventDefault()
                          setSelectedId(e.id)
                        }
                      }}
                      className={trClass(e)}
                    >
                      <td className="max-w-0 px-3 py-2 text-zinc-900">
                        <span className="line-clamp-2 min-w-0 break-all">{e.displayName}</span>
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{typeLabel[t]}</td>
                      <td className="px-3 py-2 text-zinc-500 tabular-nums">{e.sizeLabel}</td>
                      <td className="px-3 py-2 text-zinc-700">
                        {e.ingest === 'processing' ? (
                          <span className="inline-flex items-center gap-1 text-amber-800">
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                            Local preview…
                          </span>
                        ) : e.ingest === 'uploading' ? (
                          <span className="inline-flex items-center gap-1 text-sky-900">
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                            Server ingest…
                          </span>
                        ) : (
                          statusLabel(e)
                        )}
                      </td>
                      <td className="px-1 py-2 text-right">
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            deleteById(e.id)
                          }}
                          className="inline-flex rounded p-1.5 text-zinc-400 opacity-60 transition-opacity group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-700 md:opacity-0"
                          aria-label={`Remove ${e.displayName}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        {selectedId != null && renderPanel()}
      </div>
    </div>
  )
}
