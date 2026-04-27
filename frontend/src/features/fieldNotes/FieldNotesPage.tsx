import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { joinClasses } from '../../shared/ui'
import { CheckIcon, CloseIcon, TrashIcon } from '../../shared/ui/icons'
import {
  type VoiceMemoRow,
  VOICE_MEMO_DEMO,
  WEEKLY_IMPORTANT_BOXES,
} from './fieldNotesDashboardData'
import {
  type PriorityBriefCard,
  DEMO_FIELD_SALES_REPS,
  isMockPriorityBriefId,
  MOCK_PRIORITY_BRIEFS,
} from './fieldNotesPriorityData'
import { readStoredVoiceMemos, VOICE_MEMOS_CHANGED_EVENT } from './voiceMemoStore'
import { appendCannedSamiFieldMemo } from '../fieldApp/fieldDemoVoiceMemo'

const PRIORITY_BRIEFS_KEY = 'field-notes-priority-briefs-v1'
const DISMISSED_MOCK_BRIEF_IDS_KEY = 'field-notes-mock-briefs-dismissed-v1'

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function isRepSeenMap(x: unknown): x is Record<string, string> {
  if (x == null || typeof x !== 'object' || Array.isArray(x)) return false
  return Object.values(x as Record<string, unknown>).every((v) => typeof v === 'string')
}

function readUserPriorityBriefs(): PriorityBriefCard[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(PRIORITY_BRIEFS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((b): b is PriorityBriefCard => {
      if (b == null || typeof b !== 'object' || isMockPriorityBriefId(String((b as PriorityBriefCard).id))) {
        return false
      }
      const o = b as PriorityBriefCard
      return (
        typeof o.id === 'string' &&
        o.id.length > 0 &&
        typeof o.text === 'string' &&
        typeof o.createdAtIso === 'string' &&
        o.seenBy != null &&
        typeof o.seenBy === 'object' &&
        isRepSeenMap(o.seenBy)
      )
    })
  } catch {
    return []
  }
}

function writeUserPriorityBriefs(briefs: PriorityBriefCard[]) {
  try {
    const userOnly = briefs.filter((b) => !isMockPriorityBriefId(b.id))
    window.localStorage.setItem(PRIORITY_BRIEFS_KEY, JSON.stringify(userOnly))
  } catch {
    // ignore
  }
}

function readDismissedMockBriefIds(): string[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(DISMISSED_MOCK_BRIEF_IDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}

function writeDismissedMockBriefIds(ids: string[]) {
  try {
    window.localStorage.setItem(DISMISSED_MOCK_BRIEF_IDS_KEY, JSON.stringify([...new Set(ids)]))
  } catch {
    // ignore
  }
}

function formatShortSeen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function ConversationModal({
  open,
  onClose,
  row,
}: {
  open: boolean
  onClose: () => void
  row: VoiceMemoRow | null
}) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !row) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div className="min-w-0">
            <p id={titleId} className="truncate text-sm font-semibold text-zinc-900">
              {row.customer}
            </p>
            <p className="text-xs text-zinc-500">
              {row.salesman} · {formatDateTime(row.atIso)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recorded conversation</p>
          {row.conversation.map((turn, i) => (
            <div
              key={i}
              className={joinClasses(
                'rounded-xl border px-3 py-2.5 text-sm',
                turn.speaker === 'Rep' && 'border-sky-200/80 bg-sky-50/80 text-zinc-800',
                turn.speaker === 'Customer' && 'border-zinc-200 bg-zinc-50/90 text-zinc-800',
                turn.speaker === 'System' && 'border-amber-200/80 bg-amber-50/90 text-amber-950/90',
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{turn.speaker}</p>
              <p className="mt-1 leading-relaxed">{turn.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FieldPriorityBriefCardView({
  brief,
  onToggleRepSeen,
  onDelete,
}: {
  brief: PriorityBriefCard
  onToggleRepSeen: (briefId: string, repId: string) => void
  onDelete: (id: string) => void
}) {
  const mock = isMockPriorityBriefId(brief.id)
  return (
    <article
      data-testid="field-notes-priority-brief"
      className="rounded-lg border border-amber-200/70 bg-white/95 p-3 shadow-sm ring-1 ring-amber-100/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium leading-relaxed text-zinc-900">{brief.text}</p>
        <button
          type="button"
          onClick={() => onDelete(brief.id)}
          className="shrink-0 rounded-md p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-700"
          aria-label="Delete brief"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-500">{formatDateTime(brief.createdAtIso)}</p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Field team</p>
      <ul className="mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
        {DEMO_FIELD_SALES_REPS.map((rep) => {
          const at = brief.seenBy[rep.id]
          const seen = at != null
          const first = rep.name.split(' ')[0] ?? rep.name
          const chip = joinClasses(
            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
            seen
              ? 'border-emerald-200/90 bg-emerald-50/90 text-emerald-950'
              : 'border-zinc-200/90 bg-zinc-50/90 text-zinc-600',
          )
          if (mock) {
            return (
              <li key={rep.id} className={chip} title={seen ? `Opened ${formatDateTime(at!)}` : 'Not yet opened in app'}>
                {seen ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" aria-hidden />}
                <span className="font-medium">{first}</span>
                {seen && <span className="text-[10px] text-emerald-800/80">{formatShortSeen(at!)}</span>}
                {!seen && <span className="text-[10px] text-zinc-500">Pending</span>}
              </li>
            )
          }
          return (
            <li key={rep.id}>
              <button
                type="button"
                className={joinClasses(chip, 'text-left transition hover:opacity-90')}
                onClick={() => onToggleRepSeen(brief.id, rep.id)}
                title={seen ? 'Click to mark as not received (demo)' : 'Click to mark as received (demo)'}
              >
                {seen ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" aria-hidden />}
                <span className="font-medium">{first}</span>
                {seen && <span className="text-[10px] text-emerald-800/80">{formatShortSeen(at!)}</span>}
                {!seen && <span className="text-[10px] text-zinc-500">Pending</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </article>
  )
}

export function FieldNotesPage() {
  const [modalRow, setModalRow] = useState<VoiceMemoRow | null>(null)
  const [userPriorityBriefs, setUserPriorityBriefs] = useState<PriorityBriefCard[]>(() => readUserPriorityBriefs())
  const [dismissedMockBriefIds, setDismissedMockBriefIds] = useState<string[]>(() => readDismissedMockBriefIds())
  const [priorityDraft, setPriorityDraft] = useState('')
  const [storedMemos, setStoredMemos] = useState<VoiceMemoRow[]>(() => readStoredVoiceMemos())

  useEffect(() => {
    setUserPriorityBriefs(readUserPriorityBriefs())
    setDismissedMockBriefIds(readDismissedMockBriefIds())
    setStoredMemos(readStoredVoiceMemos())
  }, [])

  // Refresh when the voice flow appends a new memo (or another tab does).
  useEffect(() => {
    function onChanged() {
      setStoredMemos(readStoredVoiceMemos())
    }
    window.addEventListener(VOICE_MEMOS_CHANGED_EVENT, onChanged)
    window.addEventListener('storage', onChanged)
    return () => {
      window.removeEventListener(VOICE_MEMOS_CHANGED_EVENT, onChanged)
      window.removeEventListener('storage', onChanged)
    }
  }, [])

  /** Demo shortcut: **P** appends the canned Sami field memo to Incoming voice memos (Field App voice flow also saves this on Script 3 VAD). */
  useEffect(() => {
    if (import.meta.env.VITEST) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'p' && e.key !== 'P') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.repeat) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      try {
        appendCannedSamiFieldMemo()
      } catch {
        /* localStorage / quota */
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const rows = useMemo<VoiceMemoRow[]>(() => {
    // Merge runtime-recorded memos (newest first) with the canned demo set,
    // de-duped by id and sorted by atIso desc so the freshest dictation lands at the top.
    const seen = new Set<string>()
    const combined: VoiceMemoRow[] = []
    for (const r of [...storedMemos, ...VOICE_MEMO_DEMO]) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      combined.push(r)
    }
    return combined.sort((a, b) => b.atIso.localeCompare(a.atIso))
  }, [storedMemos])

  const combinedPriorityBriefs = useMemo(() => {
    const mocks = MOCK_PRIORITY_BRIEFS.filter((b) => !dismissedMockBriefIds.includes(b.id))
    return [...mocks, ...userPriorityBriefs].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
  }, [userPriorityBriefs, dismissedMockBriefIds])

  const sendPriority = useCallback(() => {
    const t = priorityDraft.trim()
    if (t.length === 0) return
    const next: PriorityBriefCard = {
      id: `user-brief-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: t,
      createdAtIso: new Date().toISOString(),
      seenBy: {},
    }
    setUserPriorityBriefs((prev) => {
      const m = [next, ...prev]
      writeUserPriorityBriefs(m)
      return m
    })
    setPriorityDraft('')
  }, [priorityDraft])

  const toggleRepSeen = useCallback((briefId: string, repId: string) => {
    if (isMockPriorityBriefId(briefId)) return
    setUserPriorityBriefs((prev) => {
      const i = prev.findIndex((b) => b.id === briefId)
      if (i < 0) return prev
      const b = prev[i]!
      const had = b.seenBy[repId]
      const nextSeen: Partial<Record<string, string>> = { ...b.seenBy }
      if (had) delete nextSeen[repId]
      else nextSeen[repId] = new Date().toISOString()
      const u: PriorityBriefCard = { ...b, seenBy: nextSeen }
      const out = [...prev.slice(0, i), u, ...prev.slice(i + 1)]
      writeUserPriorityBriefs(out)
      return out
    })
  }, [])

  const deleteBrief = useCallback((id: string) => {
    if (isMockPriorityBriefId(id)) {
      setDismissedMockBriefIds((prev) => {
        if (prev.includes(id)) return prev
        const next = [...prev, id]
        writeDismissedMockBriefIds(next)
        return next
      })
      return
    }
    setUserPriorityBriefs((prev) => {
      const out = prev.filter((b) => b.id !== id)
      writeUserPriorityBriefs(out)
      return out
    })
  }, [])

  return (
    <div
      className="mx-auto flex h-full min-h-0 min-w-0 max-w-6xl flex-col gap-6 p-4 md:p-6"
      data-testid="field-notes-page"
    >
      <h1 className="sr-only">Field Notes</h1>

      <section
        className="w-full min-w-0 shrink-0 rounded-xl border border-amber-200/90 bg-gradient-to-b from-amber-50/90 via-white to-zinc-50/80 p-3 shadow-sm ring-1 ring-amber-100/60 md:p-4"
        data-testid="field-notes-priority-panel"
        aria-label="High priority information"
      >
        <div className="flex w-full min-w-0 flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">High priority information</h2>
          <div className="flex w-full min-w-0 flex-row items-center gap-2">
            <input
              type="text"
              value={priorityDraft}
              onChange={(e) => setPriorityDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendPriority()
              }}
              placeholder="New brief for the field team…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
            <button
              type="button"
              onClick={sendPriority}
              className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Add brief
            </button>
          </div>
          <div className="max-h-[min(28rem,55vh)] space-y-3 overflow-y-auto pr-0.5 [scrollbar-gutter:stable]">
            {combinedPriorityBriefs.map((b) => (
              <FieldPriorityBriefCardView key={b.id} brief={b} onToggleRepSeen={toggleRepSeen} onDelete={deleteBrief} />
            ))}
          </div>
        </div>
      </section>

      <section className="min-w-0 shrink-0">
        <h2 className="text-sm font-semibold text-zinc-900">Incoming voice memos</h2>
        <p className="mb-3 text-xs text-zinc-500">Recent recordings. Open a row to read the rep&apos;s full conversation after the visit.</p>
        <div className="overflow-x-auto rounded-xl border border-zinc-200/90 bg-white shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm text-zinc-800" data-testid="field-notes-memo-table">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/95 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                <th className="whitespace-nowrap px-3 py-2.5">Customer</th>
                <th className="whitespace-nowrap px-3 py-2.5">Sales rep</th>
                <th className="whitespace-nowrap px-3 py-2.5">Date &amp; time</th>
                <th className="px-3 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900">{r.customer}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-zinc-700">{r.salesman}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-zinc-600">{formatDateTime(r.atIso)}</td>
                  <td className="max-w-[20rem] px-3 py-2.5">
                    <p className="line-clamp-1 text-zinc-600">{r.notesPreview}</p>
                    <button
                      type="button"
                      onClick={() => setModalRow(r)}
                      className="mt-0.5 text-left text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                    >
                      View conversation
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="shrink-0 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-5 ring-1 ring-zinc-100/80 md:p-6"
        aria-label="Important information"
      >
        <div className="mb-4 border-b border-zinc-200/80 pb-3">
          <h2 className="text-base font-semibold text-zinc-900">Important information</h2>
          <p className="mt-1 text-sm text-zinc-600">This week — key themes from memos and transcripts</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3" data-testid="field-notes-important-boxes">
          {WEEKLY_IMPORTANT_BOXES.map((box) => (
            <article
              key={box.title}
              className="flex min-h-[10rem] flex-col rounded-xl border border-white bg-white p-4 shadow-sm ring-1 ring-zinc-200/60"
            >
              <h3 className="text-sm font-semibold text-zinc-900">{box.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">{box.body}</p>
            </article>
          ))}
        </div>
      </section>

      <ConversationModal open={modalRow != null} onClose={() => setModalRow(null)} row={modalRow} />
    </div>
  )
}
