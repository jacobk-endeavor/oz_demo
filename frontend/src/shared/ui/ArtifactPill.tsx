import {
  STALE_OR_INVALID_ARTIFACT_ID,
  type ResolvedCitation,
} from '../../../../shared/oz/citationGrammarResolver'
import { joinClasses } from './visualSystem'

function readStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = record[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

function artifactDownloadHref(record: Record<string, unknown>): string | undefined {
  const href = readStringField(record, ['signed_url', 'download_url', 'url'])
  if (href?.startsWith('http://') || href?.startsWith('https://')) return href
  return undefined
}

function formatByteSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export type ArtifactPillProps = {
  resolved: ResolvedCitation
}

/**
 * Inline control for `<artifact …/>` — download affordance when the id resolves in the oracle.
 */
export function ArtifactPill({ resolved }: ArtifactPillProps) {
  if (resolved.citation.kind !== 'artifact') return null

  if (!resolved.ok && resolved.reason === 'invalid_artifact_id') {
    return (
      <span
        className="mx-0.5 inline rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[12px] font-medium text-amber-900"
        title={STALE_OR_INVALID_ARTIFACT_ID}
      >
        {STALE_OR_INVALID_ARTIFACT_ID}
      </span>
    )
  }

  if (!resolved.ok) return null

  const { citation, record } = resolved
  const title =
    readStringField(record, ['title']) ??
    (typeof citation.title === 'string' ? citation.title : undefined) ??
    'Artifact'
  const kind =
    readStringField(record, ['kind']) ??
    (typeof citation.artifactKind === 'string' ? citation.artifactKind : undefined) ??
    'file'
  let sizeLabel: string | undefined
  const fromRecord = record.size_bytes
  if (typeof fromRecord === 'number' && Number.isFinite(fromRecord)) {
    sizeLabel = formatByteSize(fromRecord)
  } else if (typeof citation.sizeBytes === 'string') {
    const n = Number.parseInt(citation.sizeBytes, 10)
    if (Number.isFinite(n)) sizeLabel = formatByteSize(n)
  }

  const href = artifactDownloadHref(record)

  return (
    <span
      className="group relative mx-0.5 inline-flex max-w-full align-middle"
      data-testid="oz-artifact-pill"
    >
      <span
        className={joinClasses(
          'inline-flex max-w-full items-center gap-1.5 rounded-lg border border-sky-200/90 bg-sky-50/90 py-0.5 pl-2 pr-1 text-left text-[12px] text-zinc-800 shadow-sm',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-zinc-900">{title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-600">
            <span className="uppercase tracking-wide">{kind}</span>
            {sizeLabel ? <span>{sizeLabel}</span> : null}
          </span>
        </span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            download
            className="shrink-0 rounded-md bg-sky-700 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white hover:bg-sky-800"
          >
            Download
          </a>
        ) : (
          <span
            className="shrink-0 rounded-md border border-dashed border-zinc-300 px-2 py-1 text-[11px] font-medium text-zinc-500"
            title="No download URL on artifact record"
          >
            No link
          </span>
        )}
      </span>
    </span>
  )
}
