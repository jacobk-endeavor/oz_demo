import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { ChevronLeftIcon } from '../../shared/ui/icons'
import { joinClasses } from '../../shared/ui'
import { FieldVoiceSphere } from './FieldVoiceSphere'
import {
  type FieldMobileWorkflow,
  type FieldMobileWorkflowId,
  FIELD_MOBILE_WORKFLOWS,
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

/**
 * Field App home: orb pulses to the live mic input. Eleven Labs TTS plays from the on-screen
 * "Hear" buttons inside each Run panel. No STT or LLM routing.
 */
function FieldAppVoiceColumn() {
  const {
    devices,
    selectedDeviceId,
    stream: micStream,
    error: micError,
    status: micStatus,
    connect: connectMic,
    chooseDevice: chooseMicDevice,
    setPreferredDeviceId: setPreferredMicId,
    micOnboardingDone,
  } = useFieldMicrophone()

  const [activeWorkflowId, setActiveWorkflowId] = useState<FieldMobileWorkflowId | null>(null)
  const [productDemo, setProductDemo] = useState<FieldProductDemoStep>('answer')
  const [quoteDemoDone, setQuoteDemoDone] = useState(false)
  const [prospectAnswers, setProspectAnswers] = useState<Record<number, string>>({})
  const [micSetupExpanded, setMicSetupExpanded] = useState(false)

  useEffect(() => {
    if (activeWorkflowId !== 'background-quote' || quoteDemoDone) return
    const t = window.setTimeout(() => setQuoteDemoDone(true), 2800)
    return () => window.clearTimeout(t)
  }, [activeWorkflowId, quoteDemoDone])

  const goRun = useCallback((id: FieldMobileWorkflowId) => {
    setActiveWorkflowId(id)
    if (id === 'product-recommend') setProductDemo('answer')
    if (id === 'background-quote') setQuoteDemoDone(false)
    if (id === 'prospect-notes') setProspectAnswers({})
  }, [])

  const onBackFromRun = useCallback(() => {
    setActiveWorkflowId(null)
    setProductDemo('answer')
    setQuoteDemoDone(false)
    setProspectAnswers({})
  }, [])

  const onHomeOrbClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      if (e.shiftKey && micOnboardingDone) {
        e.preventDefault()
        setMicSetupExpanded(true)
      }
    },
    [micOnboardingDone],
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

  const def = activeWorkflowId ? getFieldMobileWorkflow(activeWorkflowId) : undefined
  const showFullMicUI = !micOnboardingDone || micSetupExpanded

  return (
    <div
      className={joinClasses(
        'relative z-0 flex h-full min-h-0 w-full flex-col',
        'bg-gradient-to-b from-sky-50/80 via-slate-50/70 to-zinc-100',
        safeBottom,
      )}
      data-testid="field-app-surface"
    >
      <div className="pointer-events-auto flex min-h-0 flex-1 flex-col" data-testid="field-voice-column">
        <div className={joinClasses('flex min-h-0 flex-1 flex-col', safeTop)}>
          <SessionHeader onBack={activeWorkflowId ? onBackFromRun : null} />
          {activeWorkflowId && def ? (
            <RunView
              workflow={def}
              productDemo={productDemo}
              onProductDemo={setProductDemo}
              quoteDemoDone={quoteDemoDone}
              prospectAnswers={prospectAnswers}
              onProspectAnswers={setProspectAnswers}
              onPick={goRun}
              micStream={micStream}
            />
          ) : (
            <FieldVoiceHome
              onHomeOrbClick={onHomeOrbClick}
              showFullMic={showFullMicUI}
              micOnboardingDone={micOnboardingDone}
              micStream={micStream}
              onCollapseMicSetup={() => setMicSetupExpanded(false)}
              onPickWorkflow={goRun}
              micProps={{
                devices,
                selectedDeviceId,
                error: micError,
                status: micStatus,
                onAllow: onFieldMicAllow,
                onPickDevice: onFieldMicPick,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function FieldWorkflowMobileRoute({ workflowId }: { workflowId: FieldMobileWorkflowId }) {
  const w = getFieldMobileWorkflow(workflowId)
  const [productDemo, setProductDemo] = useState<FieldProductDemoStep>('answer')
  const [quoteDemoDone, setQuoteDemoDone] = useState(false)
  const [prospectLocal, setProspectLocal] = useState<Record<number, string>>({})

  useEffect(() => {
    setProductDemo('answer')
    setQuoteDemoDone(false)
    setProspectLocal({})
  }, [workflowId])

  useEffect(() => {
    if (workflowId !== 'background-quote') return
    const t = window.setTimeout(() => setQuoteDemoDone(true), 2800)
    return () => window.clearTimeout(t)
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
              quoteDone={quoteDemoDone}
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

type HomeMic = {
  devices: readonly MediaDeviceInfo[]
  selectedDeviceId: string
  error: string | null
  status: 'idle' | 'connecting' | 'live' | 'denied' | 'unavailable'
  onAllow: () => void
  onPickDevice: (deviceId: string) => void
}

function FieldVoiceHome({
  onHomeOrbClick,
  showFullMic,
  micOnboardingDone,
  onCollapseMicSetup,
  micStream,
  onPickWorkflow,
  micProps,
}: {
  onHomeOrbClick: (e: MouseEvent<HTMLButtonElement>) => void
  showFullMic: boolean
  micOnboardingDone: boolean
  onCollapseMicSetup: () => void
  micStream: MediaStream | null
  onPickWorkflow: (id: FieldMobileWorkflowId) => void
  micProps: HomeMic
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-3"
      data-testid="field-app-voice-home"
    >
      {showFullMic ? (
        <FieldMicrophoneControl
          idPrefix="field-voice-home"
          devices={micProps.devices}
          selectedDeviceId={micProps.selectedDeviceId}
          status={micProps.status}
          error={micProps.error}
          onAllow={micProps.onAllow}
          onPickDevice={micProps.onPickDevice}
          onDone={micOnboardingDone ? onCollapseMicSetup : undefined}
          showFirstTimeExplainer={!micOnboardingDone}
          connectDisabled={micProps.status === 'connecting'}
          compact
        />
      ) : null}
      <button
        type="button"
        onClick={onHomeOrbClick}
        title={micOnboardingDone ? 'Shift-click to open microphone settings' : undefined}
        className="touch-manipulation [touch-action:manipulation] flex flex-col items-center gap-4 rounded-3xl p-2 outline-none ring-blue-500/0 transition-transform active:scale-[0.99] focus-visible:ring-2"
        aria-label="Field orb — pulses to your microphone level. Press a hotkey to play an Oz line."
        data-testid="field-app-orb"
      >
        <FieldVoiceSphere
          pulseTarget={1}
          micStream={micStream}
          drivePulseFromMic
          label="Orb pulses to your mic input. Press a hotkey (see legend below) to play an Oz line."
        />
      </button>
      <WorkflowPicker onPick={onPickWorkflow} />
    </div>
  )
}

function WorkflowPicker({ onPick }: { onPick: (id: FieldMobileWorkflowId) => void }) {
  return (
    <div className="w-full max-w-md space-y-2" data-testid="field-voice-intent-list">
      <p className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Open a workflow</p>
      {FIELD_MOBILE_WORKFLOWS.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => onPick(w.id)}
          className="w-full rounded-2xl border border-zinc-200/80 bg-white/90 px-3 py-3 text-left shadow-sm transition hover:border-blue-200 hover:bg-sky-50/50"
        >
          <p className="text-xs font-medium text-zinc-500">{w.shortTitle}</p>
          <p className="mt-0.5 text-sm leading-snug text-zinc-900">&ldquo;{w.examplePhrases[0]}&rdquo;</p>
        </button>
      ))}
    </div>
  )
}

function RunView({
  workflow,
  productDemo,
  onProductDemo,
  quoteDemoDone,
  prospectAnswers,
  onProspectAnswers,
  onPick,
  micStream,
}: {
  workflow: FieldMobileWorkflow
  productDemo: FieldProductDemoStep
  onProductDemo: (s: FieldProductDemoStep) => void
  quoteDemoDone: boolean
  prospectAnswers: Record<number, string>
  onProspectAnswers: (next: Record<number, string>) => void
  onPick: (id: FieldMobileWorkflowId) => void
  micStream: MediaStream | null
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="field-voice-session">
      <FieldWorkflowChainBar activeId={workflow.id} onPick={onPick} />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        <WorkflowRunPanel
          workflow={workflow}
          productDemo={productDemo}
          onProductDemo={onProductDemo}
          quoteDone={quoteDemoDone}
          prospectNotesValue={workflow.id === 'prospect-notes' ? prospectAnswers : undefined}
          onProspectNotesChange={workflow.id === 'prospect-notes' ? onProspectAnswers : undefined}
        />
      </div>
      <div
        className="pointer-events-auto relative z-20 w-full max-w-lg shrink-0 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
        data-testid="field-run-voice-dock"
      >
        <div className="flex flex-col items-center pb-1">
          <FieldVoiceSphere
            size="md"
            pulseTarget={1}
            micStream={micStream}
            drivePulseFromMic
            label="Orb pulses to your mic input. Press a hotkey to play an Oz line."
          />
        </div>
      </div>
    </div>
  )
}

function FieldWorkflowChainBar({
  activeId,
  onPick,
}: {
  activeId: FieldMobileWorkflowId
  onPick: (id: FieldMobileWorkflowId) => void
}) {
  return (
    <div
      className="shrink-0 border-b border-zinc-200/50 bg-zinc-50/60 px-2 py-1.5"
      role="tablist"
      aria-label="Switch workflow"
    >
      <div className="flex min-h-0 gap-1 overflow-x-auto [scrollbar-width:thin]">
        {FIELD_MOBILE_WORKFLOWS.map((w) => {
          const active = w.id === activeId
          return (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onPick(w.id)}
              className={joinClasses(
                'shrink-0 touch-manipulation [touch-action:manipulation] rounded-lg px-2 py-1 text-xs font-medium transition',
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/90 text-zinc-700 ring-1 ring-zinc-200/80 hover:bg-sky-50/80',
              )}
            >
              {w.shortTitle}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SessionHeader({ onBack }: { onBack: (() => void) | null }) {
  return (
    <div className="flex items-center gap-1 border-b border-zinc-200/60 bg-white/60 px-1 py-1">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-200/50"
          aria-label="Back"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
      ) : (
        <span className="inline-block h-10 w-10" aria-hidden="true" />
      )}
      <p className="min-w-0 flex-1 truncate pr-2 text-sm font-medium text-zinc-800">Voice with Oz</p>
    </div>
  )
}

function WorkflowRunPanel({
  workflow,
  productDemo,
  onProductDemo,
  quoteDone,
  prospectNotesValue,
  onProspectNotesChange,
}: {
  workflow: FieldMobileWorkflow
  productDemo: FieldProductDemoStep
  onProductDemo: (s: FieldProductDemoStep) => void
  quoteDone: boolean
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
      {workflow.id === 'background-quote' && <RunBackgroundQuote done={quoteDone} />}
    </div>
  )
}
