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
    page: 'dashboards',
    title: 'Generate dashboard',
    question: 'What should the sales leader see?',
    output: 'A dashboard with charts, source counts, and recommended actions.',
    sources: '3 templates',
    saved: '45 min',
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
