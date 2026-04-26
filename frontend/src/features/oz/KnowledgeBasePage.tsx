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
import { PlusIcon, FolderOpenIcon, ChevronRightIcon, CloseIcon } from '../../shared/ui/icons'
import {
  classifyKnowledgeFile,
  processKnowledgeFile,
  type KnowledgeAssetKind,
  type ProcessedKnowledgePreview,
  type ProcessedKnowledgeResult,
} from './knowledgeBaseIngest'
import { tabularFromText, type TabularResult } from './knowledgeBaseTabular'

const KnowledgeBasePdfView = lazy(() => import('./KnowledgeBasePdfView'))

type KbFileEntry =
  | {
      id: string
      entryKind: 'file'
      displayName: string
      file: File
      sizeLabel: string
      kind: KnowledgeAssetKind
      /** null until background load finishes; demo always eventually gets a value. */
      preview: ProcessedKnowledgePreview | null
      revokeObjectUrl: () => void
    }
  | {
      id: string
      entryKind: 'folder'
      displayName: string
      sizeLabel: string
      revokeObjectUrl: () => void
    }

type StagedFile = {
  id: string
  file: File
  displayName: string
  kind: KnowledgeAssetKind
}
type StagedFolder = { id: string; displayName: string; kind: 'folder' }
type Staged = StagedFile | StagedFolder

function nextId() {
  return `kb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const PROCESSING_MS = { min: 200, max: 500 }

function processingDelay() {
  const ms = PROCESSING_MS.min + Math.random() * (PROCESSING_MS.max - PROCESSING_MS.min)
  return new Promise<void>((r) => setTimeout(r, ms))
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

type TypeBucket = 'folder' | 'excel' | 'pdf' | 'image' | 'text'

function typeBucketForEntry(e: KbFileEntry): TypeBucket {
  if (e.entryKind === 'folder') return 'folder'
  if (e.kind === 'pdf') return 'pdf'
  if (e.kind === 'image') return 'image'
  if (e.kind === 'excel') return 'excel'
  return 'text'
}

function typeBucketForStaged(s: Staged): TypeBucket {
  if (s.kind === 'folder') return 'folder'
  if (s.kind === 'pdf') return 'pdf'
  if (s.kind === 'image') return 'image'
  if (s.kind === 'excel') return 'excel'
  return 'text'
}

const TYPE_ORDER: TypeBucket[] = ['folder', 'excel', 'pdf', 'image', 'text']
const typeLabel: Record<TypeBucket, string> = {
  folder: 'Folder',
  excel: 'Excel / sheet',
  pdf: 'PDF',
  image: 'Image',
  text: 'Text / other',
}

function typeSortValue(b: TypeBucket) {
  return TYPE_ORDER.indexOf(b)
}

type SortBy = 'type' | 'name' | 'status'

function statusText(e: KbFileEntry): string {
  if (e.entryKind === 'folder') return '—'
  return 'Ready'
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

function TablePreviewView({
  table,
  sheetName,
  excelReadTruncated,
}: {
  table: TabularResult
  sheetName?: string
  excelReadTruncated?: boolean
}) {
  const cols = Math.max(1, table.headers.length, ...table.rows.map((r) => r.length))
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
            {table.rows.map((row, ri) => (
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
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <img
          src={preview.objectUrl}
          alt={preview.fileName}
          className="max-h-[min(100%,32rem)] w-auto max-w-full rounded border border-zinc-200"
        />
      </div>
    )
  }
  return (
    <div className="min-h-0 min-w-0 flex-1 p-0">
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
      className="flex w-full min-w-0 max-w-md shrink-0 flex-col border-l border-zinc-200 bg-white shadow-sm md:max-w-[min(100%,24rem)] lg:max-w-[min(100%,32rem)]"
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">{children}</div>
    </aside>
  )
}

export function KnowledgeBasePage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [staged, setStaged] = useState<Staged[]>([])
  const [rows, setRows] = useState<KbFileEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('type')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [stagedPanel, setStagedPanel] = useState<{
    id: string
    preview: ProcessedKnowledgePreview
    revoke: () => void
  } | null>(null)
  const filesForUnmountRef = useRef<KbFileEntry[]>([])
  const stagedRef = useRef(staged)
  stagedRef.current = staged

  useEffect(() => {
    filesForUnmountRef.current = rows
  }, [rows])

  type KbFileRow = Extract<KbFileEntry, { entryKind: 'file' }>
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

  const loadFilePreview = useCallback(
    async (id: string, file: File, kind: KnowledgeAssetKind) => {
      try {
        await processingDelay()
        const result = await processKnowledgeFile(file, { kind })
        const { preview, revoke } = demoNormalizeProcessResult(file, result)
        setEntry(id, (e) => ({
          ...e,
          preview,
          revokeObjectUrl: revoke,
        }))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not process file'
        const { preview, revoke } = demoNormalizeProcessResult(file, {
          type: 'error',
          message: msg,
        })
        setEntry(id, (e) => ({ ...e, preview, revokeObjectUrl: revoke }))
      }
    },
    [setEntry],
  )

  const addFilesToStaged = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const add: StagedFile[] = []
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]!
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath
      const displayName = path && path.length > 0 ? path : file.name
      const kind = classifyKnowledgeFile(file)
      add.push({ id: nextId(), file, displayName, kind })
    }
    setStaged((p) => [...p, ...add])
  }, [])

  const addFolderToStaged = useCallback((fileList: FileList | null) => {
    const name = folderNameFromDirectoryPicker(fileList)
    if (name == null) return
    setStaged((p) => [...p, { id: nextId(), displayName: name, kind: 'folder' }])
  }, [])

  const addAll = useCallback(() => {
    if (staged.length === 0) return
    const toAdd: KbFileEntry[] = []
    for (const s of staged) {
      if (s.kind === 'folder') {
        toAdd.push({
          id: s.id,
          entryKind: 'folder',
          displayName: s.displayName,
          sizeLabel: 'Folder',
          revokeObjectUrl: noopRevoke,
        })
      } else {
        toAdd.push({
          id: s.id,
          entryKind: 'file',
          file: s.file,
          displayName: s.displayName,
          sizeLabel: formatSize(s.file.size),
          kind: s.kind,
          preview: null,
          revokeObjectUrl: noopRevoke,
        })
      }
    }
    setRows((prev) => [...prev, ...toAdd])
    for (const s of staged) {
      if (s.kind === 'folder') continue
      void loadFilePreview(s.id, s.file, s.kind)
    }
    setStaged([])
  }, [staged, loadFilePreview])

  const sortedRows = useMemo(() => {
    const list = [...rows]
    const sign = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (sortBy === 'name') {
        return sign * a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
      }
      if (sortBy === 'type') {
        const ta = typeSortValue(typeBucketForEntry(a))
        const tb = typeSortValue(typeBucketForEntry(b))
        if (ta !== tb) return sign * (ta - tb)
        return sign * a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
      }
      return sign * statusText(a).localeCompare(statusText(b), undefined, { sensitivity: 'base' })
    })
    return list
  }, [rows, sortBy, sortDir])

  useEffect(() => {
    if (selectedId == null) {
      setStagedPanel((p) => {
        p?.revoke()
        return null
      })
      return
    }
    const currentStaged = stagedRef.current
    if (!currentStaged.some((s) => s.id === selectedId)) {
      setStagedPanel((p) => {
        p?.revoke()
        return null
      })
      return
    }
    const st = currentStaged.find((s) => s.id === selectedId)
    if (!st || st.kind === 'folder') {
      setStagedPanel((p) => {
        p?.revoke()
        return null
      })
      return
    }

    setStagedPanel((p) => {
      p?.revoke()
      return null
    })

    let cancelled = false
    void (async () => {
      try {
        const result = await processKnowledgeFile(st.file, { kind: st.kind })
        const { preview, revoke } = demoNormalizeProcessResult(st.file, result)
        if (cancelled) {
          revoke()
          return
        }
        setStagedPanel({ id: st.id, preview, revoke })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not process file'
        const { preview, revoke } = demoNormalizeProcessResult(st.file, { type: 'error', message: msg })
        if (cancelled) {
          revoke()
          return
        }
        setStagedPanel({ id: st.id, preview, revoke })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(
    () => () => {
      for (const f of filesForUnmountRef.current) {
        f.revokeObjectUrl()
      }
    },
    [],
  )

  useEffect(
    () => () => {
      setStagedPanel((p) => {
        p?.revoke()
        return null
      })
    },
    [],
  )

  const closePanel = useCallback(() => {
    setSelectedId(null)
  }, [])

  const renderPanel = () => {
    if (selectedId == null) return null

    const st = staged.find((s) => s.id === selectedId)
    const row = rows.find((r) => r.id === selectedId)

    if (st?.kind === 'folder' || row?.entryKind === 'folder') {
      const name = st?.kind === 'folder' ? st.displayName : (row as Extract<KbFileEntry, { entryKind: 'folder' }>).displayName
      return (
        <PanelFrame title={name} onClose={closePanel}>
          <p className="text-sm text-zinc-600">Folder — contents are not listed in the demo list.</p>
        </PanelFrame>
      )
    }

    if (st && 'file' in st) {
      if (stagedPanel == null || stagedPanel.id !== st.id) {
        return (
          <PanelFrame title={st.displayName} onClose={closePanel}>
            <p className="text-sm text-zinc-500">Loading preview…</p>
          </PanelFrame>
        )
      }
      return (
        <PanelFrame title={st.displayName} onClose={closePanel}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PreviewBody preview={stagedPanel.preview} fileName={st.displayName} />
          </div>
        </PanelFrame>
      )
    }

    if (row && row.entryKind === 'file') {
      if (row.preview == null) {
        return (
          <PanelFrame title={row.displayName} onClose={closePanel}>
            <p className="text-sm text-zinc-500">Loading preview…</p>
          </PanelFrame>
        )
      }
      return (
        <PanelFrame title={row.displayName} onClose={closePanel}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PreviewBody preview={row.preview} fileName={row.displayName} />
          </div>
        </PanelFrame>
      )
    }

    return null
  }

  const trClass = (id: string, isStagedRow: boolean) =>
    joinClasses(
      'border-b',
      isStagedRow ? 'border-sky-100 bg-sky-50/50' : 'border-zinc-100 bg-white',
      'cursor-pointer transition-colors',
      selectedId === id
        ? 'bg-sky-100/80'
        : isStagedRow
          ? 'hover:bg-sky-50/90'
          : 'hover:bg-zinc-50/80',
    )

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4"
      data-testid="knowledge-base-page"
    >
      <p className="shrink-0 text-sm text-zinc-600">
        Add files and folders, then <span className="font-medium">Add all</span> to the list. Click a row to open a
        preview. Status shows Ready for each document in the demo.
      </p>

      <div className="flex shrink-0 flex-wrap items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => {
            addFilesToStaged(e.target.files)
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
            addFolderToStaged(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
        >
          <PlusIcon className="h-4 w-4" aria-hidden />
          Add files
        </button>
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
        >
          <FolderOpenIcon className="h-4 w-4 text-zinc-500" aria-hidden />
          Add folder
        </button>
        <button
          type="button"
          onClick={addAll}
          disabled={staged.length === 0}
          className={joinClasses(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors',
            staged.length === 0
              ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400'
              : 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100',
          )}
        >
          Add all{staged.length > 0 ? ` (${staged.length})` : ''}
        </button>
        {staged.length > 0 && (
          <p className="w-full min-w-0 pl-0.5 text-[11px] text-zinc-500">Staged rows are listed below; use Add all to add them to the list.</p>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
              <option value="asc">A → Z / ascending</option>
              <option value="desc">Z → A / descending</option>
            </select>
          </label>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden md:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
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
                  <th scope="col" className="min-w-[6rem] px-3 py-2">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {staged.map((s) => {
                  const t = typeBucketForStaged(s)
                  if (s.kind === 'folder') {
                    return (
                      <tr
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedId(s.id)
                          }
                        }}
                        className={trClass(s.id, true)}
                      >
                        <td className="max-w-0 px-3 py-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="line-clamp-2 min-w-0 break-all text-zinc-900">{s.displayName}</span>
                            <span className="shrink-0 text-zinc-300" aria-hidden>
                              <ChevronRightIcon className="h-3.5 w-3.5" />
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-600">{typeLabel[t]}</td>
                        <td className="px-3 py-2 text-zinc-500">—</td>
                        <td className="px-3 py-2 text-amber-800">Staged</td>
                      </tr>
                    )
                  }
                  return (
                    <tr
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedId(s.id)
                        }
                      }}
                      className={trClass(s.id, true)}
                    >
                      <td className="max-w-0 px-3 py-2 text-zinc-900">
                        <span className="line-clamp-2 min-w-0 break-all">{s.displayName}</span>
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{typeLabel[t]}</td>
                      <td className="px-3 py-2 text-zinc-500 tabular-nums">{formatSize(s.file.size)}</td>
                      <td className="px-3 py-2 text-amber-800">Staged</td>
                    </tr>
                  )
                })}
                {rows.length === 0 && staged.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-400">
                      No rows yet. Add files or a folder, then use Add all.
                    </td>
                  </tr>
                )}
                {sortedRows.map((e) => {
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
                        className={trClass(e.id, false)}
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
                        <td className="px-3 py-2 text-zinc-500">—</td>
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
                      className={trClass(e.id, false)}
                    >
                      <td className="max-w-0 px-3 py-2 text-zinc-900">
                        <span className="line-clamp-2 min-w-0 break-all">{e.displayName}</span>
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{typeLabel[t]}</td>
                      <td className="px-3 py-2 text-zinc-500 tabular-nums">{e.sizeLabel}</td>
                      <td className="px-3 py-2 text-emerald-800">Ready</td>
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
