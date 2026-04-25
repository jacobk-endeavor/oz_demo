import { joinClasses, ozSurfaceClasses } from './visualSystem'

export type OzOrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'running_action'

export interface OzOrbPrompt {
  id: string
  label: string
}

interface OzOrbProps {
  state?: OzOrbState
  orbSrc?: string
  label?: string
  detail?: string
  prompts?: OzOrbPrompt[]
  onPromptSelect?: (prompt: OzOrbPrompt) => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const stateCopy: Record<OzOrbState, { label: string; detail: string }> = {
  idle: {
    label: 'Oz is standing by',
    detail: 'Ask for the next sales action.',
  },
  listening: {
    label: 'Listening...',
    detail: 'Capturing field context.',
  },
  thinking: {
    label: 'Thinking',
    detail: 'Ranking sources and confidence.',
  },
  speaking: {
    label: 'Speaking',
    detail: 'Streaming the recommendation.',
  },
  running_action: {
    label: 'Running action',
    detail: 'Coordinating background agents.',
  },
}

const sizeClasses = {
  sm: {
    shell: 'h-28 w-28',
    halo: 'h-36 w-36',
    image: 'h-24 w-24',
  },
  md: {
    shell: 'h-44 w-44',
    halo: 'h-56 w-56',
    image: 'h-[9.5rem] w-[9.5rem]',
  },
  lg: {
    shell: 'h-60 w-60',
    halo: 'h-[19rem] w-[19rem]',
    image: 'h-52 w-52',
  },
} as const

const stateClasses: Record<OzOrbState, string> = {
  idle: 'oz-orb--idle',
  listening: 'oz-orb--listening',
  thinking: 'oz-orb--thinking',
  speaking: 'oz-orb--speaking',
  running_action: 'oz-orb--running-action',
}

export function OzOrb({
  state = 'idle',
  orbSrc = '/assets/oz-speaking-orb-reference.png',
  label,
  detail,
  prompts = [],
  onPromptSelect,
  size = 'md',
  className,
}: OzOrbProps) {
  const copy = stateCopy[state]
  const dimensions = sizeClasses[size]

  return (
    <section
      className={joinClasses(
        ozSurfaceClasses.card,
        'flex flex-col items-center gap-5 overflow-hidden p-6 text-center',
        className,
      )}
      aria-label="Oz voice assistant"
    >
      <div
        className={joinClasses('oz-orb relative grid place-items-center', stateClasses[state])}
        data-state={state}
      >
        <div className={joinClasses('oz-orb__halo absolute rounded-full', dimensions.halo)} />
        <div className={joinClasses('oz-orb__ring absolute rounded-full', dimensions.halo)} />
        <div
          className={joinClasses(
            'oz-orb__body relative grid place-items-center rounded-full',
            dimensions.shell,
          )}
        >
          <div className="oz-orb__fallback absolute inset-0 rounded-full" aria-hidden="true" />
          <img
            src={orbSrc}
            alt=""
            aria-hidden="true"
            onError={(event) => {
              event.currentTarget.style.opacity = '0'
            }}
            className={joinClasses(
              'oz-orb__image relative z-10 rounded-full object-cover',
              dimensions.image,
            )}
          />
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#23B8FF]">
          {label ?? copy.label}
        </p>
        <p className="max-w-xs text-sm text-[#8B93A7]">{detail ?? copy.detail}</p>
      </div>

      {prompts.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2" aria-label="Suggested prompts">
          {prompts.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              onClick={() => onPromptSelect?.(prompt)}
              className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-[#F5F7FF] transition hover:border-[#23B8FF]/45 hover:bg-[#0674FF]/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23B8FF]"
            >
              {prompt.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
