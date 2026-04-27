import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { joinClasses } from '../../shared/ui'
import { playFieldElevenTts, stopFieldTts } from '../../services/fieldElevenTts'
import { FieldVoiceSphere } from './FieldVoiceSphere'
import {
  type FieldMobileWorkflow,
  type FieldMobileWorkflowId,
  getFieldMobileWorkflow,
} from './fieldMobileWorkflows'
import { FieldMicrophoneControl } from './FieldMicrophoneControl'
import {
  RunBackgroundQuote,
  RunCustomerHistory,
  RunProductRecommend,
  RunProspectNotes,
  RunUpsell,
  type FieldProductDemoStep,
} from './FieldWorkflowRunPanels'
import { useFieldMicrophone } from './useFieldMicrophone'
import { buildFieldScriptQueue, nextScriptStartIndex } from './fieldDemoScriptQueue'
import { useFieldVoiceTurnTaking } from './fieldVoiceTurnTaking'
import { appendCannedSamiFieldMemo } from './fieldDemoVoiceMemo'
import { sendProductSpecsEmail } from './fieldDemoProductSpecsEmail'
import {
  seedJcrLumberQuoteIfAbsent,
  setVoiceLumberHandoffUnlocked,
} from '../quotesReady/quotesReadyForReviewStore'

const safeBottom = 'pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]'
const safeTop = 'pt-[max(0.5rem,env(safe-area-inset-top,0px))]'

export type FieldAppViewMode = 'home' | 'mobile-workflow'

export interface FieldAppViewProps {
  mode: FieldAppViewMode
  /** When `mode` is `mobile-workflow`, which workflow to show (authoring + interactive run). */
  workflowId?: FieldMobileWorkflowId
}

export function FieldAppView({ mode, workflowId }: FieldAppViewProps) {
  if (mode === 'mobile-workflow' && workflowId) {
    return <FieldWorkflowMobileRoute key={workflowId} workflowId={workflowId} />
  }
  return <FieldAppVoiceColumn />
}

type Phase = 'idle' | 'listening' | 'speaking' | 'oz' | 'done'

/**
 * Field App home: tap the orb to start. The mic opens, the rep speaks the next
 * scripted line, and when they stop talking the next Eleven Labs line plays.
 * Loops until every step in `buildFieldScriptQueue()` (Field voice runbook) has played.
 */
function FieldAppVoiceColumn() {
  const {
    devices,
    selectedDeviceId,
    stream: micStream,
    error: micError,
    status: micStatus,
    connect: connectMic,
    ensureStream: ensureMicStream,
    chooseDevice: chooseMicDevice,
    setPreferredDeviceId: setPreferredMicId,
    micOnboardingDone,
  } = useFieldMicrophone()

  const queue = useMemo(buildFieldScriptQueue, [])
  const [phase, setPhase] = useState<Phase>('idle')
  const [stepIndex, setStepIndex] = useState(0)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [micSetupExpanded, setMicSetupExpanded] = useState(false)
  const cancelTtsRef = useRef(false)
  const phaseRef = useRef<Phase>('idle')
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  const stepIndexRef = useRef(0)
  useEffect(() => {
    stepIndexRef.current = stepIndex
  }, [stepIndex])

  const onSpeechStart = useCallback(() => {
    setPhase((p) => (p === 'listening' ? 'speaking' : p))
  }, [])

  const onSpeechEnd = useCallback(() => {
    const i = stepIndexRef.current
    if (phaseRef.current === 'speaking' && queue[i]?.appendCannedFieldMemoOnSpeechEnd) {
      try {
        appendCannedSamiFieldMemo()
      } catch {
        /* localStorage */
      }
      setStepIndex(i + 1)
      setPhase('oz')
      return
    }
    setPhase((p) => (p === 'speaking' ? 'oz' : p))
  }, [queue])

  useFieldVoiceTurnTaking(
    micStream,
    phase === 'listening' || phase === 'speaking',
    { onSpeechStart, onSpeechEnd },
  )

  // When phase enters 'oz', play the current step's TTS, then advance to the
  // next step (or 'done' if we've exhausted the queue). On TTS error, surface
  // the message and drop back to 'listening' so the rep can re-trigger.
  useEffect(() => {
    if (phase !== 'oz') return
    const step = queue[stepIndex]
    if (!step) {
      setPhase('done')
      return
    }
    if (step.appendCannedFieldMemoOnSpeechEnd) {
      setPhase('listening')
      return
    }
    cancelTtsRef.current = false
    setTtsError(null)
    void playFieldElevenTts(step.ozSays, { sessionKey: 'field-script' })
      .then(() => {
        if (cancelTtsRef.current) return
        if (step.sideEffect === 'send-product-specs-email') {
          // The Script 2 "Ok, sending" turn — fire the canned product-specs
          // email through the dev server's SMTP proxy. Failures (no creds, SMTP
          // error) surface in the rep's `ttsError` banner so they know.
          void sendProductSpecsEmail()
            .then((res) => {
              if (!res.ok) setTtsError(`Email failed: ${res.error ?? 'unknown error'}`)
            })
            .catch((e: unknown) => {
              setTtsError(`Email failed: ${e instanceof Error ? e.message : String(e)}`)
            })
        }
        if (step.sideEffect === 'seed-quotes-ready-lumber') {
          // Same-tab session flag so Quotes Ready can drop stale lumber rows; then persist the JCR row.
          setVoiceLumberHandoffUnlocked()
          seedJcrLumberQuoteIfAbsent()
        }
        const next = stepIndex + 1
        setStepIndex(next)
        if (next < queue.length && queue[next]?.skipRepListen) {
          setPhase('oz')
        } else if (next < queue.length) {
          setPhase('listening')
        } else {
          setPhase('done')
        }
      })
      .catch((e: unknown) => {
        if (cancelTtsRef.current) return
        setTtsError(e instanceof Error ? e.message : String(e))
        setPhase('listening')
      })
    return () => {
      cancelTtsRef.current = true
      stopFieldTts()
    }
  }, [phase, stepIndex, queue])

  const startRun = useCallback(async () => {
    if (micStatus === 'connecting') return
    const s = await ensureMicStream()
    if (!s) {
      setMicSetupExpanded(true)
      return
    }
    setStepIndex(0)
    setTtsError(null)
    setPhase('listening')
  }, [ensureMicStream, micStatus])

  const onOrbClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (e.shiftKey && micOnboardingDone) {
        e.preventDefault()
        setMicSetupExpanded(true)
        return
      }
      if (phase === 'idle' || phase === 'done') {
        void startRun()
      }
    },
    [micOnboardingDone, phase, queue.length, startRun],
  )

  const onFieldMicAllow = useCallback(() => {
    void connectMic(selectedDeviceId || null)
  }, [connectMic, selectedDeviceId])

  const onFieldMicPick = useCallback(
    (id: string) => {
      if (micStatus === 'live') void chooseMicDevice(id)
      else setPreferredMicId(id)
    },
    [micStatus, chooseMicDevice, setPreferredMicId],
  )

  const skipTarget = nextScriptStartIndex(queue, stepIndex)
  const canSkipScript =
    skipTarget !== null &&
    (phase === 'listening' || phase === 'speaking' || phase === 'oz')
  const onSkipScript = useCallback(() => {
    if (skipTarget === null) return
    cancelTtsRef.current = true
    stopFieldTts()
    setTtsError(null)
    setStepIndex(skipTarget)
    setPhase('listening')
  }, [skipTarget])

  const [chromeHidden, setChromeHidden] = useState(false)
  const toggleChrome = useCallback(() => setChromeHidden((prev) => !prev), [])

  const ozPulse = useSpeechLikePulse(phase === 'oz')
  const showFullMicUI = !micOnboardingDone || micSetupExpanded
  const drivePulseFromMic = phase === 'listening' || phase === 'speaking'
  const pulseTarget = drivePulseFromMic ? 1 : phase === 'oz' ? ozPulse : 0.16
  const stepLabel = stepIndex < queue.length ? queue[stepIndex]!.label : 'Done'
  const stepNumber = Math.min(stepIndex + 1, queue.length)
  const statusLine = statusForPhase(phase, stepNumber, queue.length)
  const orbLabel = orbLabelForPhase(phase)

  return (
    <div
      className={joinClasses(
        'relative z-0 flex h-full min-h-0 w-full flex-col',
        'bg-gradient-to-b from-sky-50/80 via-slate-50/70 to-zinc-100',
        safeBottom,
      )}
      data-testid="field-app-surface"
      onDoubleClick={toggleChrome}
      title="Double-click to hide or show the surrounding UI"
    >
      <div className="pointer-events-auto flex min-h-0 flex-1 flex-col" data-testid="field-voice-column">
        <div className={joinClasses('flex min-h-0 flex-1 flex-col', safeTop)}>
          {chromeHidden ? null : <SessionHeader />}
          <div
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-4 py-3"
            data-testid="field-app-voice-home"
          >
            {!chromeHidden && showFullMicUI ? (
              <FieldMicrophoneControl
                idPrefix="field-voice-home"
                devices={devices}
                selectedDeviceId={selectedDeviceId}
                status={micStatus}
                error={micError}
                onAllow={onFieldMicAllow}
                onPickDevice={onFieldMicPick}
                onDone={micOnboardingDone ? () => setMicSetupExpanded(false) : undefined}
                showFirstTimeExplainer={!micOnboardingDone}
                connectDisabled={micStatus === 'connecting'}
                compact
              />
            ) : null}
            {!chromeHidden && ttsError ? (
              <p
                className="max-w-sm rounded-xl border border-rose-200/80 bg-rose-50/70 px-3 py-2 text-center text-xs text-rose-900"
                role="alert"
              >
                Voice failed: {ttsError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={onOrbClick}
              title={micOnboardingDone ? 'Shift-click to open microphone settings' : undefined}
              className="touch-manipulation [touch-action:manipulation] flex flex-col items-center gap-3 rounded-3xl p-2 outline-none ring-blue-500/0 transition-transform active:scale-[0.99] focus-visible:ring-2"
              aria-label={orbLabel}
              data-testid="field-app-orb"
            >
              <FieldVoiceSphere
                pulseTarget={pulseTarget}
                micStream={drivePulseFromMic ? micStream : null}
                drivePulseFromMic={drivePulseFromMic}
                label={orbLabel}
              />
            </button>
            {chromeHidden ? null : (
              <div className="flex w-full max-w-sm flex-col items-center gap-1 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Step {stepNumber} of {queue.length}
                </p>
                <p className="text-sm font-medium text-zinc-800">{stepLabel}</p>
                <p className="text-xs text-zinc-600">{statusLine}</p>
                {canSkipScript ? (
                  <button
                    type="button"
                    onClick={onSkipScript}
                    className="mt-2 rounded-full border border-zinc-300/80 bg-white/80 px-3 py-1 text-[11px] font-medium text-zinc-700 shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    data-testid="field-app-skip-script"
                  >
                    Skip to next script →
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * While `active`, returns a value in roughly [0.25, 0.95] that varies on every animation
 * frame in a speech-like envelope: a fast syllable rhythm (~5 Hz), a slower phrasing
 * cadence (~0.9 Hz), and a smaller flutter (~11 Hz). The orb's internal smoothing then
 * chases this target, so the visible pulse breathes the way someone speaking does.
 * Returns 0 when inactive so callers can decide a resting value.
 */
function useSpeechLikePulse(active: boolean): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active) {
      setValue(0)
      return
    }
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = now - start
      const syllable = 0.34 * (1 + Math.sin(t * 0.030)) * 0.5
      const phrase = 0.22 * (1 + Math.sin(t * 0.0055 + 1.3)) * 0.5
      const flutter = 0.12 * (1 + Math.sin(t * 0.072 + 0.4)) * 0.5
      const next = Math.min(1, 0.27 + syllable + phrase + flutter)
      setValue(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
  return value
}

function statusForPhase(phase: Phase, stepNumber: number, total: number): string {
  switch (phase) {
    case 'idle':
      return 'Tap the orb to start the demo.'
    case 'listening':
      return stepNumber === 1
        ? 'Read your first line aloud. The next Oz line plays when you pause.'
        : 'Read the next line aloud. The next Oz line plays when you pause.'
    case 'speaking':
      return 'Listening — keep going. Oz will pick up when you stop.'
    case 'oz':
      return 'Oz is speaking…'
    case 'done':
      return `All ${total} lines played. Tap the orb to run the demo again.`
  }
}

function orbLabelForPhase(phase: Phase): string {
  switch (phase) {
    case 'idle':
      return 'Tap the orb to start the demo. Oz answers between your lines.'
    case 'listening':
      return 'Listening. Speak your next line; Oz will reply when you pause.'
    case 'speaking':
      return 'Hearing you speak. Oz will reply when you stop.'
    case 'oz':
      return 'Oz is speaking. Wait for the line to finish.'
    case 'done':
      return 'Demo complete. Tap to start over.'
  }
}

function FieldWorkflowMobileRoute({ workflowId }: { workflowId: FieldMobileWorkflowId }) {
  const w = getFieldMobileWorkflow(workflowId)
  const [productDemo, setProductDemo] = useState<FieldProductDemoStep>('answer')
  const [prospectLocal, setProspectLocal] = useState<Record<number, string>>({})

  useEffect(() => {
    setProductDemo('answer')
    setProspectLocal({})
  }, [workflowId])

  if (!w) return null

  return (
    <div
      className={joinClasses(
        'flex h-full min-h-0 w-full flex-col',
        'bg-gradient-to-b from-sky-50/80 via-slate-50/70 to-zinc-100',
        safeBottom,
      )}
      data-testid="field-app-surface"
      data-field-workflow={workflowId}
    >
      <div
        className={joinClasses('min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3', safeTop)}
        data-testid="field-mobile-workflow-bench"
      >
        <SingleWorkflowAuthoringCard workflow={w} />
        <div className="rounded-2xl border border-zinc-200/90 bg-white/90 p-1 shadow-sm">
          <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Live mock (interact)
          </p>
          <div className="p-2">
            <WorkflowRunPanel
              workflow={w}
              productDemo={productDemo}
              onProductDemo={setProductDemo}
              prospectNotesValue={workflowId === 'prospect-notes' ? prospectLocal : undefined}
              onProspectNotesChange={workflowId === 'prospect-notes' ? setProspectLocal : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function SingleWorkflowAuthoringCard({ workflow }: { workflow: FieldMobileWorkflow }) {
  return (
    <article
      className="rounded-2xl border border-zinc-200/90 bg-white/90 p-3 shadow-sm"
      data-testid={`field-workflow-card-${workflow.id}`}
    >
      <p className="text-xs leading-relaxed text-zinc-600">
        <strong>Source:</strong> edit in{' '}
        <code className="rounded bg-zinc-200/50 px-1 text-[11px]">fieldMobileWorkflows.ts</code>
      </p>
      <h3 className="mt-2 text-sm font-semibold text-zinc-900">{workflow.shortTitle}</h3>
      <p className="mt-1 text-xs text-zinc-500">Example phrase</p>
      <p className="text-sm text-zinc-800">&ldquo;{workflow.examplePhrases[0]}&rdquo;</p>
      <p className="mt-2 text-xs font-medium uppercase text-zinc-500">Intent</p>
      <p className="text-sm text-zinc-700">{workflow.behaviorIntent}</p>
      <p className="mt-2 text-xs font-medium uppercase text-zinc-500">Data sources</p>
      <ul className="ml-4 list-disc text-sm text-zinc-600">
        {workflow.dataSources.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs font-medium uppercase text-zinc-500">Product notes</p>
      <p className="text-sm text-zinc-600">{workflow.productNotes}</p>
    </article>
  )
}

function SessionHeader() {
  return (
    <div className="flex items-center gap-1 border-b border-zinc-200/60 bg-white/60 px-3 py-2">
      <p className="min-w-0 flex-1 text-sm font-medium text-zinc-800">Voice with Oz</p>
    </div>
  )
}

function WorkflowRunPanel({
  workflow,
  productDemo,
  onProductDemo,
  prospectNotesValue,
  onProspectNotesChange,
}: {
  workflow: FieldMobileWorkflow
  productDemo: FieldProductDemoStep
  onProductDemo: (s: FieldProductDemoStep) => void
  prospectNotesValue?: Record<number, string>
  onProspectNotesChange?: (next: Record<number, string>) => void
}) {
  return (
    <div className="w-full min-w-0" data-testid={`field-workflow-run-${workflow.id}`}>
      {workflow.id === 'customer-interactions' && <RunCustomerHistory />}
      {workflow.id === 'product-recommend' && (
        <RunProductRecommend step={productDemo} onStep={onProductDemo} />
      )}
      {workflow.id === 'upsell-cross-sell' && <RunUpsell />}
      {workflow.id === 'prospect-notes' && (
        <RunProspectNotes value={prospectNotesValue} onChange={onProspectNotesChange} />
      )}
      {workflow.id === 'background-quote' && <RunBackgroundQuote />}
    </div>
  )
}
