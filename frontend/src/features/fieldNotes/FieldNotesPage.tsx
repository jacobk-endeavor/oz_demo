import { useMemo, useState, type ReactNode } from 'react'
import { Panel, PulseOrb, Tag } from '../../shared/ui'
import { FieldNotesVisitLogTable } from './FieldNotesVisitLogTable'
import { fieldNotesDemo } from './demoData'
import type { FieldNotesStage, OrbState } from './types'

const orbStateByStage: Record<FieldNotesStage, OrbState> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  followup: 'thinking',
  output: 'speaking',
  pushed: 'running_action',
}

const stageCopy: Record<FieldNotesStage, { label: string; helper: string; button: string; tone: 'zinc' | 'blue' | 'amber' | 'emerald' }> = {
  idle: {
    label: 'Ready',
    helper: 'Tap the orb to run the scripted field note. No microphone needed.',
    button: 'Tap to speak',
    tone: 'zinc',
  },
  listening: {
    label: 'Listening...',
    helper: 'Oz is capturing the rep’s sales context.',
    button: 'Finish note',
    tone: 'blue',
  },
  thinking: {
    label: 'Thinking',
    helper: 'Oz is structuring the note and ranking next questions.',
    button: 'Prepare follow-up',
    tone: 'blue',
  },
  followup: {
    label: 'Follow-up needed',
    helper: 'Ask the benefit prompt before Oz recommends a product or pushes specs.',
    button: 'Choose prompt below',
    tone: 'amber',
  },
  output: {
    label: 'Speaking',
    helper: 'Oz produced the note, follow-up questions, pricing angle, and product idea.',
    button: 'Push to Nebula',
    tone: 'blue',
  },
  pushed: {
    label: 'Pushed to Nebula',
    helper: 'Product specs, draft quote, and follow-up tasks are live in the web app.',
    button: 'Reset demo',
    tone: 'emerald',
  },
}

const nextStageByStage: Record<FieldNotesStage, FieldNotesStage> = {
  idle: 'listening',
  listening: 'thinking',
  thinking: 'followup',
  followup: 'followup',
  output: 'pushed',
  pushed: 'idle',
}

const visibleTranscriptCount: Record<FieldNotesStage, number> = {
  idle: 0,
  listening: 2,
  thinking: 3,
  followup: 3,
  output: 3,
  pushed: 3,
}

const benefitPrompt = 'Anything else they might benefit from?'
const suggestedPrompts = ['What should I ask next?', 'How should I price this?', benefitPrompt]

export function FieldNotesPage() {
  const [stage, setStage] = useState<FieldNotesStage>('idle')
  const copy = stageCopy[stage]
  const showOutput = stage === 'output' || stage === 'pushed'
  const showSalesActions = stage === 'pushed'
  const isBenefitPromptStep = stage === 'followup'
  const orbActive = stage !== 'idle' && stage !== 'pushed'
  const orbState = orbStateByStage[stage]

  const visibleTranscript = useMemo(
    () => fieldNotesDemo.transcript.slice(0, visibleTranscriptCount[stage]),
    [stage],
  )

  function advanceDemo() {
    setStage((current) => nextStageByStage[current])
  }

  function askBenefitPrompt() {
    setStage('output')
  }

  return (
    <div className="space-y-8">
      <FieldNotesVisitLogTable />
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* Mobile-shaped voice panel */}
      <section className="rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            <span>Oz Mobile</span>
            <span>{fieldNotesDemo.meetingType}</span>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">
                  Field Notes
                </p>
                <h2 className="mt-1 truncate text-lg font-semibold text-zinc-900">
                  {fieldNotesDemo.customer}
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500">
                  {fieldNotesDemo.rep} · {fieldNotesDemo.meetingDate}
                </p>
              </div>
              <Tag tone={copy.tone} dot>
                {copy.label}
              </Tag>
            </div>

            <button
              type="button"
              data-testid="field-notes-advance"
              onClick={advanceDemo}
              disabled={isBenefitPromptStep}
              className="mx-auto mt-7 flex flex-col items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-2xl"
              aria-label={`${copy.button} field note demo`}
            >
              <span data-testid="oz-orb" data-state={orbState}>
                <PulseOrb size="lg" paused={!orbActive} label="Oz voice indicator" />
              </span>
              <span
                className={[
                  'rounded-xl px-5 py-2 text-sm font-semibold transition-colors',
                  isBenefitPromptStep
                    ? 'bg-zinc-100 text-zinc-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                ].join(' ')}
              >
                {copy.button}
              </span>
            </button>

            <p className="mt-4 text-center text-sm text-zinc-600">{copy.helper}</p>
          </div>

          <div className="mt-4 space-y-2" aria-label="Suggested prompts">
            {suggestedPrompts.map((prompt) => {
              const isActionable = isBenefitPromptStep && prompt === benefitPrompt
              return (
                <button
                  key={prompt}
                  type="button"
                  disabled={!isActionable}
                  onClick={askBenefitPrompt}
                  className={[
                    'w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                    isActionable
                      ? 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100'
                      : 'border-zinc-200 bg-white text-zinc-700',
                  ].join(' ')}
                >
                  {prompt}
                  {isActionable && (
                    <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                      Tap to ask before Oz recommends
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-6">
        <Panel
          eyebrow="Scripted transcript"
          title="Messy voice note"
          action={<Tag tone={stage === 'listening' ? 'blue' : 'zinc'}>{stage === 'listening' ? 'Streaming' : 'Deterministic demo'}</Tag>}
        >
          {visibleTranscript.length > 0 ? (
            <div className="space-y-3">
              {visibleTranscript.map((line) => (
                <div key={line.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    {line.speaker}
                  </p>
                  <p className="mt-1.5 text-sm text-zinc-800">{line.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>Transcript appears here as the presenter advances the listening state.</EmptyState>
          )}
        </Panel>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Panel
            eyebrow="Oz output"
            title="Structured sales note"
            action={<Tag tone={showOutput ? 'emerald' : 'zinc'}>{showOutput ? 'Ready' : 'Waiting'}</Tag>}
          >
            {showOutput ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">Summary</h3>
                  <p className="mt-1 text-sm text-zinc-700">{fieldNotesDemo.structuredSummary}</p>
                </div>
                <SourceEvidence />
                <List title="Follow-up questions" items={fieldNotesDemo.questionsToAsk} />
                <List title="Upsell and cross-sell" items={fieldNotesDemo.upsellSuggestions} />
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <h3 className="text-sm font-semibold text-blue-900">Pricing guidance</h3>
                  <p className="mt-1 text-sm text-blue-900/80">{fieldNotesDemo.pricingGuidance}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {['Normalize meeting context', 'Rank customer intent', 'Prepare sales actions'].map((task) => (
                  <div key={task} className="h-10 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60" aria-label={task} />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Nebula sync"
            title="Concrete sales actions"
            action={
              <Tag tone={showSalesActions ? 'emerald' : showOutput ? 'blue' : 'zinc'}>
                {showSalesActions ? 'Pushed' : showOutput ? 'Ready to push' : 'Locked'}
              </Tag>
            }
          >
            {showSalesActions ? (
              <div className="space-y-3">
                {fieldNotesDemo.salesActions.map((action) => (
                  <article key={action.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-zinc-900">{action.label}</h3>
                      <Tag tone="zinc">{action.owner}</Tag>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600">{action.detail}</p>
                  </article>
                ))}
                <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  Pushed to Nebula: product specs, draft quote, and follow-up task are live for {fieldNotesDemo.rep}.
                </div>
              </div>
            ) : (
              <EmptyState>
                Sales actions stay locked until Oz has structured the note, the rep asks the benefit follow-up, and the
                presenter pushes the result to Nebula.
              </EmptyState>
            )}
          </Panel>
        </div>
      </div>
    </div>
    </div>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-600">
      {children}
    </div>
  )
}

function SourceEvidence() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <h3 className="text-sm font-semibold text-zinc-900">Source evidence</h3>
      <dl className="mt-2 space-y-2 text-sm">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Product context</dt>
          <dd className="mt-0.5 text-zinc-700">{fieldNotesDemo.productContext}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Raw note</dt>
          <dd className="mt-0.5 text-zinc-700">{fieldNotesDemo.rawNote}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Prior interactions</dt>
          <dd className="mt-0.5">
            <ul className="space-y-1.5">
              {fieldNotesDemo.priorInteractions.map((interaction) => (
                <li key={interaction} className="rounded-md bg-white px-3 py-1.5 text-zinc-700 ring-1 ring-zinc-200">
                  {interaction}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
    </div>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
