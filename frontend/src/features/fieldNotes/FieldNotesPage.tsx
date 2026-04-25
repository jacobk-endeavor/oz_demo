import { useMemo, useState, type ReactNode } from 'react'
import { fieldNotesDemo } from './demoData'
import type { FieldNotesStage, OrbState } from './types'

const stageCopy: Record<FieldNotesStage, { label: string; helper: string; button: string }> = {
  idle: {
    label: 'Ready',
    helper: 'Tap the orb to run the scripted field note without a microphone.',
    button: 'Tap to speak',
  },
  listening: {
    label: 'Listening...',
    helper: 'Oz is capturing the messy sales context from the visit.',
    button: 'Finish note',
  },
  thinking: {
    label: 'Thinking',
    helper: 'Oz is structuring the note and ranking the next best questions.',
    button: 'Show Oz output',
  },
  output: {
    label: 'Speaking',
    helper: 'Oz found the pricing angle, follow-up questions, and sales actions.',
    button: 'Push to Nebula',
  },
  pushed: {
    label: 'Pushed to Nebula',
    helper: 'Product specs, draft quote, and follow-up task are ready in the web app.',
    button: 'Reset demo',
  },
}

const orbStateByStage: Record<FieldNotesStage, OrbState> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  output: 'speaking',
  pushed: 'running_action',
}

const nextStageByStage: Record<FieldNotesStage, FieldNotesStage> = {
  idle: 'listening',
  listening: 'thinking',
  thinking: 'output',
  output: 'pushed',
  pushed: 'idle',
}

const visibleTranscriptCount: Record<FieldNotesStage, number> = {
  idle: 0,
  listening: 2,
  thinking: 3,
  output: 3,
  pushed: 3,
}

export function FieldNotesPage() {
  const [stage, setStage] = useState<FieldNotesStage>('idle')
  const copy = stageCopy[stage]
  const orbState = orbStateByStage[stage]
  const showOutput = stage === 'output' || stage === 'pushed'
  const visibleTranscript = useMemo(
    () => fieldNotesDemo.transcript.slice(0, visibleTranscriptCount[stage]),
    [stage],
  )

  function advanceDemo() {
    setStage((current) => nextStageByStage[current])
  }

  return (
    <section className="min-h-screen overflow-hidden bg-[#030407] px-6 py-8 text-[#F5F7FF]">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-[2.2rem] border border-white/15 bg-[#080A12] p-3 shadow-2xl shadow-[#0674FF]/20">
          <div className="rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(35,184,255,0.25),transparent_32%),linear-gradient(180deg,#07172F_0%,#030407_58%)] px-5 py-6">
            <div className="mb-5 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-[#8B93A7]">
              <span>Oz Mobile</span>
              <span>{fieldNotesDemo.meetingType}</span>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/35 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#23B8FF]">Field Notes</p>
                  <h1 className="mt-2 text-2xl font-semibold">{fieldNotesDemo.customer}</h1>
                  <p className="mt-1 text-sm text-[#8B93A7]">
                    {fieldNotesDemo.rep} · {fieldNotesDemo.meetingDate}
                  </p>
                </div>
                <span className="rounded-full border border-[#23B8FF]/40 bg-[#23B8FF]/10 px-3 py-1 text-xs text-[#BFEAFF]">
                  {copy.label}
                </span>
              </div>

              <button
                type="button"
                data-testid="field-notes-advance"
                onClick={advanceDemo}
                className="group mx-auto mt-8 flex flex-col items-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23B8FF]"
                aria-label={`${copy.button} field note demo`}
              >
                <OzOrb state={orbState} />
                <span className="rounded-full bg-[#E10600] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#E10600]/30 transition group-hover:bg-[#FF3B00]">
                  {copy.button}
                </span>
              </button>

              <p className="mx-auto mt-4 max-w-xs text-center text-sm text-[#8B93A7]">{copy.helper}</p>
            </div>

            <div className="mt-5 space-y-3" aria-label="Suggested prompts">
              {['What should I ask next?', 'How should I price this?', 'Anything else they might benefit from?'].map(
                (prompt) => (
                  <div
                    key={prompt}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-[#DCE7FF]"
                  >
                    {prompt}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <Panel
            eyebrow="Scripted Transcript"
            title="Messy voice note"
            action={stage === 'listening' ? 'Streaming' : 'Deterministic demo'}
          >
            {visibleTranscript.length > 0 ? (
              <div className="space-y-3">
                {visibleTranscript.map((line) => (
                  <div key={line.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#23B8FF]">{line.speaker}</p>
                    <p className="mt-2 text-sm leading-6 text-[#F5F7FF]">{line.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm text-[#8B93A7]">
                Transcript appears here as the presenter advances the listening state.
              </p>
            )}
          </Panel>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <Panel eyebrow="Oz Output" title="Structured sales note" action={showOutput ? 'Ready' : 'Waiting'}>
              {showOutput ? (
                <div className="space-y-5">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Summary</h2>
                    <p className="mt-2 text-sm leading-6 text-[#CAD5EA]">{fieldNotesDemo.structuredSummary}</p>
                  </div>

                  <List title="Follow-up questions" items={fieldNotesDemo.questionsToAsk} />
                  <List title="Upsell and cross-sell" items={fieldNotesDemo.upsellSuggestions} />

                  <div className="rounded-2xl border border-[#23B8FF]/30 bg-[#0674FF]/10 p-4">
                    <h2 className="text-sm font-semibold text-[#BFEAFF]">Pricing guidance</h2>
                    <p className="mt-2 text-sm leading-6 text-[#EAF6FF]">{fieldNotesDemo.pricingGuidance}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {['Normalize meeting context', 'Rank customer intent', 'Prepare sales actions'].map((task) => (
                    <div key={task} className="h-14 rounded-2xl bg-white/[0.05] p-4">
                      <div className="h-2 w-2/3 rounded-full bg-white/15" aria-label={task} />
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel eyebrow="Nebula Sync" title="Concrete sales actions" action={stage === 'pushed' ? 'Pushed' : 'Queued'}>
              <div className="space-y-3">
                {fieldNotesDemo.salesActions.map((action) => (
                  <article key={action.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-white">{action.label}</h3>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-[#DCE7FF]">
                        {action.owner}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#8B93A7]">{action.detail}</p>
                  </article>
                ))}
              </div>

              {stage === 'pushed' && (
                <div
                  role="status"
                  className="mt-4 rounded-2xl border border-[#23B8FF]/40 bg-[#23B8FF]/10 p-4 text-sm text-[#BFEAFF]"
                >
                  Pushed to Nebula: product specs, draft quote, and follow-up task are live for {fieldNotesDemo.rep}.
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </section>
  )
}

function OzOrb({ state }: { state: OrbState }) {
  const stateClasses: Record<OrbState, string> = {
    idle: 'scale-100 opacity-90',
    listening: 'scale-110 shadow-[#23B8FF]/70',
    thinking: 'scale-95 animate-spin shadow-[#7C3AED]/60',
    speaking: 'scale-105 shadow-[#F5F7FF]/60',
    running_action: 'scale-100 shadow-[#E10600]/60',
  }

  return (
    <span
      data-testid="oz-orb"
      data-state={state}
      className={[
        'relative block h-44 w-44 rounded-full border border-white/25 shadow-2xl transition duration-500',
        'bg-[radial-gradient(circle_at_42%_32%,rgba(245,247,255,0.95),rgba(35,184,255,0.72)_18%,rgba(6,116,255,0.42)_42%,rgba(225,6,0,0.38)_70%,rgba(3,4,7,0.82)_100%)]',
        'before:absolute before:inset-[-14px] before:rounded-full before:border before:border-[#23B8FF]/30 before:content-[""]',
        'after:absolute after:inset-6 after:rounded-full after:bg-[url("/assets/oz-speaking-orb-reference.png")] after:bg-cover after:bg-center after:opacity-40 after:mix-blend-screen after:content-[""]',
        stateClasses[state],
      ].join(' ')}
    >
      <span className="absolute inset-8 rounded-full border border-white/20" />
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_28px_10px_rgba(35,184,255,0.55)]" />
    </span>
  )
}

function Panel({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string
  title: string
  action: string
  children: ReactNode
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#080A12]/90 p-5 shadow-xl shadow-black/30">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#23B8FF]">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-[#DCE7FF]">
          {action}
        </span>
      </div>
      {children}
    </section>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-[#CAD5EA]">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
