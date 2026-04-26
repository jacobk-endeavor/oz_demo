import { Button, Panel, PulseOrb, Tag } from '../../shared/ui'

interface OzHomePageProps {
  onNavigate: (page: string) => void
}

const journey = [
  {
    title: 'Turn data into a leader view',
    description: 'Dashboards summarize demand, source mix, and next actions in one place.',
    cta: 'Open Dashboards',
    page: 'dashboards',
  },
  {
    title: 'Work the lead grid in Tables',
    description: 'Open the Milwaukee distributor set, then sort, filter, and act from chat on Oz or here.',
    cta: 'Open Tables',
    page: 'tables',
  },
  {
    title: 'Search the workspace',
    description: 'Search is the cross-surface way to find accounts, files, and logs in one pass.',
    cta: 'Open Search',
    page: 'search',
  },
]

const samplePrompts = [
  'Find the next best sales action.',
  'Tell me the top requested products this month.',
  'Draft a quote for Russin Lumber composite decking.',
  'Find lookalike customers near tomorrow’s route.',
]

export function OzHomePage({ onNavigate }: OzHomePageProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel
        eyebrow="Voice assistant"
        title="Oz is ready"
        description="Voice-first sales assistant. Every prompt also runs as a scripted demo so the live presentation never depends on a microphone."
      >
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <PulseOrb size="lg" />
          <p className="text-lg font-medium text-zinc-800">
            “Find the next best sales action.”
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => onNavigate('dashboards')}>Open Dashboards</Button>
            <Button variant="secondary" onClick={() => onNavigate('tables')}>
              Open Tables
            </Button>
          </div>
        </div>

        <div className="mt-6 border-t border-zinc-200 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Sample prompts
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {samplePrompts.map((prompt) => (
              <Tag key={prompt} tone="blue">
                {prompt}
              </Tag>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4">
        {journey.map((step, index) => (
          <article
            key={step.title}
            className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">
                Step {String(index + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-1 text-base font-semibold text-zinc-900">{step.title}</h3>
              <p className="mt-1 text-sm text-zinc-600">{step.description}</p>
            </div>
            <Button variant="secondary" onClick={() => onNavigate(step.page)}>
              {step.cta}
            </Button>
          </article>
        ))}
      </div>
    </div>
  )
}
