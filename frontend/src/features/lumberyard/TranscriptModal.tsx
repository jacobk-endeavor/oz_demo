import { CloseIcon } from '../../shared/ui/icons'
import { joinClasses } from '../../shared/ui'
import type { LumberyardCallRow, LumberyardSource } from './lumberyardTypes'
import { CallAudioPlayer } from './CallAudioPlayer'
import { parseLumberyardCallTranscript, type CallTranscriptTurn } from './callTranscriptFormat'

function sourceLabel(s: LumberyardSource): string {
  if (s === 'call_recording') return 'Phone call'
  if (s === 'email') return 'Email'
  return 'Field note'
}

function sourceBadgeClass(s: LumberyardSource): string {
  if (s === 'call_recording') return 'border-violet-200/80 bg-violet-50/90 text-violet-900'
  if (s === 'email') return 'border-amber-200/80 bg-amber-50/90 text-amber-950'
  return 'border-emerald-200/80 bg-emerald-50/90 text-emerald-950'
}

function roleLabel(role: CallTranscriptTurn['role']): string {
  return role === 'rep' ? 'Rep' : 'Customer'
}

function StructuredCallTranscript({ text }: { text: string }) {
  const parsed = parseLumberyardCallTranscript(text)
  if (parsed.mode === 'raw') {
    return (
      <pre className="whitespace-pre-wrap break-words rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3 font-sans text-xs leading-relaxed text-zinc-800">
        {parsed.raw}
      </pre>
    )
  }

  const { header, turns, remainder } = parsed

  return (
    <div className="space-y-5">
      {header.length > 0 ? (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Call summary
          </h4>
          <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-3">
            <dl className="space-y-3">
              {header.map((row, hi) => (
                <div
                  key={`${row.key}-${hi}`}
                  className="border-b border-violet-200/50 pb-3 last:border-b-0 last:pb-0"
                >
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    {row.key}
                  </dt>
                  <dd
                    className={joinClasses(
                      'mt-0.5 text-sm text-zinc-800 [overflow-wrap:anywhere]',
                      row.key.toLowerCase() === 'title' && 'font-semibold text-zinc-900',
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}

      {turns.length > 0 ? (
        <div>
          <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Conversation
          </h4>
          <ul className="flex flex-col gap-2.5" role="list">
            {turns.map((t, i) => {
              const isRep = t.role === 'rep'
              return (
                <li
                  key={`${i}-${t.speaker}-${t.text.slice(0, 12)}`}
                  className={joinClasses('flex w-full', isRep ? 'justify-start' : 'justify-end')}
                >
                  <div
                    className={joinClasses(
                      'max-w-[min(100%,30rem)] rounded-xl border px-3 py-2.5 shadow-sm',
                      isRep
                        ? 'border-violet-200/90 bg-white text-left'
                        : 'border-sky-200/90 bg-sky-50/90 text-left',
                    )}
                  >
                    <p className="text-[10px] font-semibold leading-tight text-zinc-500">
                      <span className="text-zinc-800">{t.speaker}</span>
                      <span className="mx-1.5 text-zinc-300" aria-hidden>
                        ·
                      </span>
                      <span
                        className={joinClasses(
                          'uppercase tracking-wide',
                          isRep ? 'text-violet-700' : 'text-sky-800',
                        )}
                      >
                        {roleLabel(t.role)}
                      </span>
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-800 [overflow-wrap:anywhere]">
                      {t.text}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {remainder ? (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Additional notes
          </h4>
          <pre className="whitespace-pre-wrap break-words rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3 font-sans text-xs leading-relaxed text-zinc-800">
            {remainder}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

export function TranscriptModal({
  call: row,
  onClose,
}: {
  call: LumberyardCallRow | null
  onClose: () => void
}) {
  if (row == null) return null

  const isCall = row.source === 'call_recording'
  const isEmail = row.source === 'email'
  const isField = row.source === 'field_notes'
  const emailBody = (row.emailTranscript ?? row.transcriptText).trim()
  const fieldBody = (row.fieldNotesText ?? row.transcriptText).trim()
  const showRecording = isCall

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transcript-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-zinc-900/40"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        className={joinClasses(
          'relative z-10 max-h-[min(88vh,760px)] w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-xl',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200/80 bg-zinc-50/90 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p id="transcript-modal-title" className="truncate text-sm font-semibold text-zinc-900">
                {row.title}
              </p>
              <span
                className={joinClasses(
                  'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                  sourceBadgeClass(row.source),
                )}
              >
                {sourceLabel(row.source)}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-600">
              <span className="font-medium text-zinc-800">{row.customerName}</span>
              {row.location ? <span> · {row.location}</span> : null}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {row.repPersona}
              {row.customerPersona ? <span> · {row.customerPersona}</span> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200/50 hover:text-zinc-800"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[min(72vh,640px)] overflow-y-auto">
          <div className="space-y-4 px-4 py-4">
            {showRecording && (
              <div>
                <CallAudioPlayer
                  key={row.id}
                  audioUrl={row.audioUrl}
                  knownDurationSec={row.durationSec ?? null}
                />
              </div>
            )}

            {isEmail && (
              <div>
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Email thread
                </h3>
                <pre className="whitespace-pre-wrap break-words rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-3 font-sans text-xs leading-relaxed text-zinc-800">
                  {emailBody}
                </pre>
              </div>
            )}

            {isField && (
              <div>
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Field voice note
                </h3>
                <pre className="whitespace-pre-wrap break-words rounded-xl border border-emerald-200/50 bg-emerald-50/30 p-3 font-sans text-xs leading-relaxed text-zinc-800">
                  {fieldBody}
                </pre>
              </div>
            )}

            {isCall && (
              <div>
                <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Transcript
                </h3>
                <StructuredCallTranscript text={row.transcriptText} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
