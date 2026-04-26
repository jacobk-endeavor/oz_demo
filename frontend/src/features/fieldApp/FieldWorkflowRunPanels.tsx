import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { playFieldElevenTts, stopFieldTts, subscribeTtsSessionKey } from '../../services/fieldElevenTts'
import { PauseIcon, PlayIcon } from '../../shared/ui/icons'
import { joinClasses } from '../../shared/ui'
import { appendFieldNotesVisitLog, buildFullNoteFromParts } from './fieldNotesVisitLog'
import { buildProspectOpeningTtsText, isProspectCoreQuoteReady, PROSPECT_QS } from './prospectNotesData'
import {
  KENNY_ACCOUNT_SNAPSHOT,
  KENNY_HILLS_ACCOUNT,
  KENNY_HILLS_BRANCH,
  KENNY_NOTES,
  KENNY_SALES_ROWS,
} from './fieldDemoKennyData'
import { KENNY_TTS_AUDIO_BRIEF, TTS_RECOMMEND, TTS_UPSELL } from './fieldDemoVoiceCopy'
import { JobCostEstimateRecapSheet } from './JobCostEstimateRecapSheet'
import { jcrOverridesFromProspectAnswers } from './jcrFromProspectAnswers'
import { JCR_JSON_EXAMPLE_DEFAULTS } from './jobCostEstimateRecap'

export type FieldProductDemoStep = 'answer' | 'specPrompt' | 'useCases'

const TTS_PROSPECT = buildProspectOpeningTtsText()

function FieldTtsButton({
  label,
  text,
  className,
  compact,
}: {
  label: string
  text: string
  className?: string
  compact?: boolean
}) {
  const ttsId = useId()
  const [phase, setPhase] = useState<'idle' | 'playing' | 'error'>('idle')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => () => stopFieldTts(), [])

  useEffect(() => {
    return subscribeTtsSessionKey((key) => {
      if (key != null && key !== ttsId) setPhase('idle')
    })
  }, [ttsId])

  const onPress = useCallback(() => {
    if (phase === 'playing') {
      stopFieldTts()
      setPhase('idle')
      return
    }
    setErr(null)
    setPhase('playing')
    void playFieldElevenTts(text, { sessionKey: ttsId })
      .then(() => {
        setPhase('idle')
      })
      .catch((e) => {
        setPhase('error')
        setErr(e instanceof Error ? e.message : String(e))
      })
  }, [phase, text, ttsId])

  const isPlaying = phase === 'playing'

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onPress}
        className={joinClasses(
          'inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition',
          compact ? 'px-3 py-1.5 text-xs' : 'w-full px-3 py-2.5 text-sm',
          phase === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-900'
            : 'border-sky-200/80 bg-sky-50/80 text-sky-950 hover:bg-sky-100/80',
          className,
        )}
        aria-pressed={isPlaying}
        data-testid="field-tts-button"
      >
        {phase === 'playing' ? (
          <PauseIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <PlayIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 text-left">{label}</span>
      </button>
      {err ? <p className="text-[11px] text-rose-700">{err}</p> : null}
    </div>
  )
}

function FieldKennySalesAndNotesTable() {
  return (
    <div className="space-y-4" data-testid="field-customer-inline-table">
      <div>
        <p className="text-base font-semibold text-zinc-900">Recent sales to this account</p>
        <p className="text-xs text-zinc-500">
          {KENNY_HILLS_ACCOUNT} · {KENNY_HILLS_BRANCH}
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          {KENNY_ACCOUNT_SNAPSHOT} Est. is mock for demo. Scroll sideways on a narrow phone if needed.
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-zinc-200/90 bg-white shadow-sm">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm" role="table" aria-label="Sales history for this account">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50/90 text-left text-xs font-medium uppercase tracking-wide text-zinc-600">
              <th scope="col" className="whitespace-nowrap px-3 py-2.5">Date</th>
              <th scope="col" className="px-3 py-2.5">Product</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2.5">Qty / scope</th>
              <th scope="col" className="whitespace-nowrap px-2 py-2.5">Est.</th>
              <th scope="col" className="px-3 py-2.5">Line note</th>
            </tr>
          </thead>
          <tbody>
            {KENNY_SALES_ROWS.map((row) => (
              <tr
                key={row.date + row.product}
                className="border-b border-zinc-100 last:border-0 odd:bg-white even:bg-zinc-50/40"
              >
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900 tabular-nums">{row.date}</td>
                <td className="px-3 py-2.5 text-zinc-800">{row.product}</td>
                <td className="px-3 py-2.5 text-zinc-700">{row.qty}</td>
                <td className="whitespace-nowrap px-2 py-2.5 font-medium tabular-nums text-zinc-800">{row.estValue}</td>
                <td className="px-3 py-2.5 text-zinc-600">{row.lineNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Past notes (field + service)</h3>
        <ul className="mt-2 list-none space-y-2 p-0">
          {KENNY_NOTES.map((n) => (
            <li
              key={n.who + n.text}
              className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-3 text-sm text-zinc-800"
            >
              <p className="text-xs font-medium text-zinc-500">{n.who}</p>
              <p className="mt-1 leading-relaxed">{n.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function RunCustomerHistory() {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-zinc-800">
        Readout for <strong>{KENNY_HILLS_ACCOUNT}</strong> before you walk in. The table stays on screen while you
        keep talking to Oz (tap the orb at the bottom).
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-end">
        <div className="sm:max-w-xs sm:shrink-0">
          <FieldTtsButton
            label="Hear a quick audio summary (Eleven Labs)"
            text={KENNY_TTS_AUDIO_BRIEF}
            className="w-full border-violet-200/80 bg-violet-50/80 text-violet-950"
          />
        </div>
      </div>
      <FieldKennySalesAndNotesTable />
    </div>
  )
}

export function RunProductRecommend({
  step,
  onStep,
}: {
  step: FieldProductDemoStep
  onStep: (s: FieldProductDemoStep) => void
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-3 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Visit signal</p>
        <p className="mt-1 text-sm text-amber-950/95">
          Last time at Kenny Hills they had to <strong>call back a day later</strong> to add{' '}
          <strong>Apex Hidden Fasteners</strong> — try to close that on this visit so they are not chasing you
          from the lot.
        </p>
        <div className="mt-2">
          <FieldTtsButton
            label="Play visit signal"
            text={TTS_RECOMMEND}
            compact
            className="w-full sm:w-auto"
          />
        </div>
      </div>

      {step === 'answer' && (
        <>
          <p className="text-sm text-zinc-800">
            Start with the <strong>capped composite line you quoted last time</strong>, then{' '}
            <strong>Apex hidden fasteners</strong> if they are stepping up. Deck drainage still plays if the site
            stays wet.
          </p>
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3">
            <p className="text-xs font-semibold text-amber-900">Spec pulled</p>
            <p className="mt-0.5 text-sm text-amber-950/90">Apex clip system · span table · ICC-ESR excerpt (mock)</p>
            <button
              type="button"
              onClick={() => onStep('specPrompt')}
              className="mt-2 w-full rounded-xl bg-amber-600/90 py-2.5 text-sm font-medium text-white"
            >
              Do you want any specific info on this product?
            </button>
          </div>
        </>
      )}
      {step === 'specPrompt' && (
        <div className="space-y-2">
          <p className="text-sm text-zinc-700">I can read span limits, fire rating, or warranty. What should I read first?</p>
          <button
            type="button"
            onClick={() => onStep('useCases')}
            className="w-full rounded-2xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-900"
          >
            What are some use cases for it?
          </button>
        </div>
      )}
      {step === 'useCases' && (
        <div className="rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm">
          <p className="text-sm font-medium text-zinc-900">From the spec (spoken summary)</p>
          <p className="mt-1 text-sm text-zinc-700">
            Coastal decks, pool surrounds, and anywhere you want a clean face with no top screws. Min one-quarter
            inch gapping for drainage in wet climates.
          </p>
        </div>
      )}
    </div>
  )
}

const UPSELL_BUNDLE = [
  {
    title: 'Your primary line',
    line: 'Capped composite (Mahogany) — the deck surface you are positioning today',
    kicker: 'Matches Kenny Hills’ last big purchase',
  },
  {
    title: 'Fasteners (paired)',
    line: 'Apex Hidden Fasteners — the item they had to add next day last time',
    kicker: 'Pair every deck quote with this so the job leaves complete',
  },
  {
    title: 'Third item (typical add)',
    line: 'Color-matched fascia / riser bundle on long runs',
    kicker: 'Historically bought with the other two for similar accounts',
  },
] as const

export function RunUpsell() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-800">
        For <strong>{KENNY_HILLS_ACCOUNT}</strong>, when reps lead with the deck line and fasteners, a third line
        usually lands—here is the pattern from similar contractor accounts.
      </p>
      <div className="mb-1">
        <FieldTtsButton
          label="Hear the bundle"
          text={TTS_UPSELL}
          className="border-emerald-200/80 bg-emerald-50/50 text-emerald-950"
        />
      </div>
      <ul className="list-none space-y-2 p-0">
        {UPSELL_BUNDLE.map((b) => (
          <li
            key={b.title}
            className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-3 text-sm text-emerald-950/90"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{b.title}</p>
            <p className="mt-0.5 font-medium">{b.line}</p>
            <p className="mt-1 text-xs text-emerald-900/85">{b.kicker}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

const QUOTE_AUTOFILL_KEY = 'oz-quote-autofill' as const

export function RunProspectNotes({
  value,
  onChange,
}: {
  /** When set with `onChange`, inputs are controlled (voice column fills from transcription). */
  value?: Record<number, string>
  onChange?: (next: Record<number, string>) => void
} = {}) {
  const [inner, setInner] = useState<Record<number, string>>({})
  const [quoteNeedBy, setQuoteNeedBy] = useState('')
  const [quotePo, setQuotePo] = useState('')
  const [quoteModalOpen, setQuoteModalOpen] = useState(false)
  const controlled = onChange != null
  const answers = controlled ? (value ?? {}) : inner
  const setAnswerLine = (i: number, s: string) => {
    if (controlled) onChange!({ ...answers, [i]: s })
    else setInner((a) => ({ ...a, [i]: s }))
  }

  const parts = {
    customer: (answers[0] ?? '').trim(),
    competitors: (answers[1] ?? '').trim(),
    insights: (answers[2] ?? '').trim(),
    lineItems: (answers[3] ?? '').trim(),
    shipTo: (answers[4] ?? '').trim(),
  }

  const quoteGaps: string[] = []
  if (!parts.customer) quoteGaps.push('Customer / account')
  if (!parts.lineItems) quoteGaps.push('Line items & quantities')
  if (!parts.shipTo) quoteGaps.push('Ship-to address')
  if (!quoteNeedBy.trim()) quoteGaps.push('Need-by date for quote')

  function logVisitToFieldNotes() {
    appendFieldNotesVisitLog({
      userLabel: 'Field rep (demo)',
      customer: parts.customer || '—',
      competitors: parts.competitors || '—',
      insights: parts.insights || '—',
      lineItems: parts.lineItems || '—',
      shipTo: parts.shipTo || '—',
      fullNote: buildFullNoteFromParts(parts),
    })
    try {
      window.dispatchEvent(new Event('field-notes-visit-log-changed'))
    } catch {
      /* ignore */
    }
    setQuoteModalOpen(true)
  }

  function openQuoteAutomation() {
    try {
      sessionStorage.setItem(
        QUOTE_AUTOFILL_KEY,
        JSON.stringify({
          customer: parts.customer,
          lineItems: parts.lineItems,
          shipTo: parts.shipTo,
          needBy: quoteNeedBy,
          po: quotePo,
        }),
      )
    } catch {
      /* ignore */
    }
    setQuoteModalOpen(false)
    window.location.hash = '#/quote-automation'
  }

  const quoteCoreReady = isProspectCoreQuoteReady(answers)

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-800">
        This is the <strong>visit order + note</strong> session (five on-screen fields). The <strong>Background quote (drive
        time)</strong> tool in the top strip is a <strong>separate</strong> handoff for queuing a quote in the app — use
        both or one. Oz asks the five visit topics; when you have <strong>customer, line items, and ship-to</strong>,
        you can go straight to quote and Oz will not push the optional lines unless you are still adding them. The
        <strong> Job Cost Recap sheet</strong> below pre-fills from your answers — edit any cell, then{' '}
        <strong>Log to Field notes</strong> or <strong>Open Quote Automation</strong>.
      </p>
      {quoteCoreReady ? (
        <div
          className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2.5"
          data-testid="prospect-quote-core-ready"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Ready for quote generation</p>
          <p className="mt-0.5 text-sm text-emerald-950/95">
            Customer, line items, and ship-to are in place. Use <strong>Log visit to Field notes</strong> to open the
            quote handoff, or keep dictating for competitors and call insights if you want a fuller visit note.
          </p>
        </div>
      ) : null}
      <FieldTtsButton
        label="Hear the questions (Eleven Labs)"
        text={TTS_PROSPECT}
        className="border-fuchsia-200/80 bg-fuchsia-50/50 text-fuchsia-950"
      />

      <ProspectQuoteSheetCard answers={answers} onLogVisit={logVisitToFieldNotes} />

      <ol className="list-decimal space-y-3 pl-4 text-sm text-zinc-800">
        {PROSPECT_QS.map((q, i) => (
          <li key={q}>
            <p>{q}</p>
            <input
              type="text"
              value={answers[i] ?? ''}
              onChange={(e) => setAnswerLine(i, e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              placeholder="Voice or type; leave blank to fill after the call…"
              aria-label={`Answer ${i + 1}`}
            />
          </li>
        ))}
      </ol>
      <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/60 p-3">
        <p className="text-xs font-semibold uppercase text-zinc-500">Live note (demo)</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
          {[parts.customer, parts.competitors, parts.insights, parts.lineItems, parts.shipTo].some((x) => x.length > 0)
            ? `Kenny Hills / prospect visit\n\n${buildFullNoteFromParts(parts)}`
            : 'Add answers above to build the note.'}
        </p>
      </div>

      {quoteModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prospect-quote-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
            <h2 id="prospect-quote-modal-title" className="text-base font-semibold text-zinc-900">
              Generate a quote from this visit?
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              We will pass what you captured into Quote Automation. Fill anything that was not provided yet.
            </p>
            {quoteGaps.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-amber-900">
                {quoteGaps.map((g) => (
                  <li key={g}>Still need: {g}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-emerald-800">Core quote fields look covered — you can still edit below.</p>
            )}
            <label className="mt-3 block text-xs font-medium text-zinc-500">
              Need-by date
              <input
                type="text"
                value={quoteNeedBy}
                onChange={(e) => setQuoteNeedBy(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="e.g. next Friday, 2026-05-12"
              />
            </label>
            <label className="mt-2 block text-xs font-medium text-zinc-500">
              PO / job ref
              <input
                type="text"
                value={quotePo}
                onChange={(e) => setQuotePo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Optional"
              />
            </label>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setQuoteModalOpen(false)}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={openQuoteAutomation}
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                Open Quote Automation
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Editable Excel-like quote sheet, pre-filled from the prospect Q&A answers.
 * Replaces the prior PDF download flow — same template (Job Cost Recap),
 * same handoff to Field notes, but the rep edits cells directly instead of
 * generating a static PDF.
 */
function ProspectQuoteSheetCard({
  answers,
  onLogVisit,
}: {
  answers: Record<number, string>
  onLogVisit: () => void
}) {
  const overrides = useMemo(() => jcrOverridesFromProspectAnswers(answers), [answers])
  // Re-mount the sheet when the seeded fields change so prospect edits flow into the cells.
  const sheetKey = useMemo(
    () => `${overrides.customer_name ?? ''}|${(overrides.job_description ?? '') as string}`,
    [overrides],
  )
  return (
    <div
      className="rounded-2xl border border-fuchsia-200/80 bg-fuchsia-50/40 p-3"
      data-testid="prospect-quote-sheet-card"
    >
      <p className="text-xs font-semibold uppercase text-fuchsia-900">Quote sheet (Job Cost Recap, demo)</p>
      <p className="mt-1 text-sm text-fuchsia-950/90">
        Pre-filled with your visit answers and Kenny Hills demo defaults. Edit any cell, then log the visit or
        kick off the invoice.
      </p>
      <div className="mt-3">
        <JobCostEstimateRecapSheet
          key={sheetKey}
          initialOverrides={overrides}
          caption="Quote sheet from prospect visit (editable)"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onLogVisit}
          className="rounded-xl border border-fuchsia-600/40 bg-fuchsia-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-fuchsia-700"
        >
          Log visit to Field notes
        </button>
      </div>
    </div>
  )
}

export function RunBackgroundQuote() {
  const [invoiceMsg, setInvoiceMsg] = useState<string | null>(null)
  // The voice-demo example is Sammy Carter / Q25-1102 / automation cell upgrade —
  // populate every cell so the demo reads as a finished, formula-balanced
  // Excel quote from the JSON template.
  const overrides = useMemo(() => ({ ...JCR_JSON_EXAMPLE_DEFAULTS }), [])
  return (
    <div className="space-y-3" data-testid="field-bg-quote">
      <div className="rounded-2xl border border-violet-200/80 bg-violet-50/50 p-3">
        <p className="text-xs font-semibold uppercase text-violet-800">Web app agent (background)</p>
        <p className="mt-0.5 text-sm text-violet-950/90">
          Voice-triggered quote drafted into the <strong>Job Cost Recap</strong> sheet below (Q26-0002-04 template).
          Every cell is editable, formulas update live as you change hours, rates, or component costs. When the
          numbers look right, hit <strong>Create invoice from sheet</strong>.
        </p>
      </div>
      <div
        className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3"
        data-testid="field-bg-quote-status"
      >
        <p className="text-sm font-medium text-emerald-900">
          Quote sheet ready — pre-filled from the <strong>Q25-1102 (Sammy Carter · automation cell upgrade)</strong> example.
        </p>
      </div>
      <JobCostEstimateRecapSheet
        initialOverrides={overrides}
        caption="Quote sheet — Sammy Carter · automation cell upgrade (Q25-1102, demo)"
        onCreateInvoice={({ computed }) => {
          const total = computed.total_cost ?? 0
          const profit = computed.profit ?? 0
          const margin = computed.profit_margin ?? 0
          setInvoiceMsg(
            `Invoice queued (demo). Total cost $${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}, profit $${profit.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${(margin * 100).toFixed(1)}% margin).`,
          )
        }}
      />
      {invoiceMsg ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          {invoiceMsg}
        </p>
      ) : null}
    </div>
  )
}
