import { Button, Tag } from '../../shared/ui'

interface NebulaHubPageProps {
  onNavigate: (page: string) => void
}

interface NebulaCard {
  page: string
  title: string
  question: string
  output: string
  sources: string
  saved: string
}

const cards: NebulaCard[] = [
  {
    page: 'field-notes',
    title: 'Capture field notes',
    question: 'What did the customer say in the visit?',
    output: 'Structured note, follow-up questions, upsell, and pricing guidance.',
    sources: '1 voice memo',
    saved: '8 min',
  },
  {
    page: 'call-mining',
    title: 'Mine calls for demand',
    question: 'What are customers asking for?',
    output: 'Ranked demand, complaints, competitors, and rep actions.',
    sources: '60 interactions',
    saved: '3 hr',
  },
  {
    page: 'dashboards',
    title: 'Generate dashboard',
    question: 'What should the sales leader see?',
    output: 'A dashboard with charts, source counts, and recommended actions.',
    sources: '3 templates',
    saved: '45 min',
  },
  {
    page: 'quote-automation',
    title: 'Build pricing quote',
    question: 'Can Oz draft the first 80 percent?',
    output: 'Quote lines, assumptions, source references, and review controls.',
    sources: '1 spec PDF',
    saved: '1 hr',
  },
  {
    page: 'lead-generation',
    title: 'Find similar customers',
    question: 'Who should the rep visit next?',
    output: 'Lookalike accounts, route order, talking points, product angles.',
    sources: '12 prospects',
    saved: '2 hr',
  },
  {
    page: 'reports',
    title: 'Prepare weekly report',
    question: 'How does this become a recurring process?',
    output: 'Digest preview, recipients, cadence, delivery status.',
    sources: '6 sections',
    saved: '40 min',
  },
]

export function NebulaHubPage({ onNavigate }: NebulaHubPageProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <article
          key={card.page}
          className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">
            {card.question}
          </p>
          <h3 className="mt-1.5 text-base font-semibold text-zinc-900">{card.title}</h3>
          <p className="mt-2 text-sm text-zinc-600">{card.output}</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Tag tone="zinc">{card.sources}</Tag>
            <Tag tone="emerald" dot>
              {card.saved} saved
            </Tag>
          </div>
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" onClick={() => onNavigate(card.page)}>
              Open
            </Button>
          </div>
        </article>
      ))}
    </div>
  )
}
