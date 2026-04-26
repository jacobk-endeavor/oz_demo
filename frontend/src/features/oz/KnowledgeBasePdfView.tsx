import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { KNOWLEDGE_PDF_MAX_PAGE_RENDER } from './knowledgeBaseIngest'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Same copy of pdfjs-dist as `react-pdf` / `package.json#pdfjs-dist` (avoids 5.4 vs 5.6 API/worker mix-ups).
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

function KnowledgeBasePdfView({ fileUrl, fileName }: { fileUrl: string; fileName: string }) {
  const [nPages, setNPages] = useState(0)
  const [w, setW] = useState(720)
  const [loadError, setLoadError] = useState<string | null>(null)
  const passwordCallbackRef = useRef<((password: string) => void) | null>(null)
  const [pdfPasswordOpen, setPdfPasswordOpen] = useState(false)
  const [pdfPassword, setPdfPassword] = useState('')

  const measureRef = useRef<HTMLDivElement>(null)
  const onResize = useCallback(() => {
    const el = measureRef.current
    if (el) setW(Math.max(240, el.clientWidth - 24))
  }, [])

  useEffect(() => {
    onResize()
    const el = measureRef.current
    const ro = new ResizeObserver(() => onResize())
    if (el) ro.observe(el)
    window.addEventListener('resize', onResize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [onResize, fileUrl])

  const toShow = Math.min(nPages, KNOWLEDGE_PDF_MAX_PAGE_RENDER)
  return (
    <div ref={measureRef} className="flex h-full min-h-0 min-w-0 flex-col">
      <p className="shrink-0 border-b border-zinc-100 px-3 py-1.5 text-[11px] text-zinc-500">
        <span className="font-medium text-zinc-700">{fileName}</span>
        {nPages > 0 && (
          <span>
            {` — ${nPages} page${nPages === 1 ? '' : 's'}`}
            {nPages > KNOWLEDGE_PDF_MAX_PAGE_RENDER
              ? ` (showing first ${KNOWLEDGE_PDF_MAX_PAGE_RENDER})`
              : ''}
          </span>
        )}
      </p>
      {pdfPasswordOpen && (
        <form
          className="shrink-0 space-y-2 border-b border-amber-200 bg-amber-50/80 px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            const cb = passwordCallbackRef.current
            if (cb) {
              cb(pdfPassword)
              setPdfPasswordOpen(false)
              setPdfPassword('')
            }
          }}
        >
          <p className="text-xs font-medium text-amber-900">This PDF is password protected.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-[11px] text-zinc-600">
              <span className="mb-0.5 block">Password</span>
              <input
                type="password"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                className="w-full rounded border border-amber-200/80 bg-white px-2 py-1 text-sm text-zinc-900"
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-900"
            >
              Unlock
            </button>
          </div>
        </form>
      )}
      {loadError && <div className="p-2 text-sm text-rose-700" role="alert">{loadError}</div>}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        <Document
          file={fileUrl}
          loading={(
            <div className="flex items-center justify-center py-8 text-sm text-zinc-500">Loading PDF…</div>
          )}
          onLoadError={(err) => {
            setLoadError(err.message)
            setNPages(0)
          }}
          onLoadSuccess={(doc) => {
            setLoadError(null)
            setNPages(doc.numPages)
          }}
          onPassword={(callback) => {
            passwordCallbackRef.current = callback
            setPdfPasswordOpen(true)
          }}
        >
          {nPages > 0
            && Array.from({ length: toShow }, (_, i) => i + 1).map((page) => (
              <div
                key={page}
                className="flex justify-center rounded-lg border border-zinc-200 bg-zinc-50/80 p-1 shadow-sm"
              >
                <Page pageNumber={page} width={w} renderTextLayer className="max-w-full" />
              </div>
            ))}
        </Document>
      </div>
    </div>
  )
}

export default KnowledgeBasePdfView
