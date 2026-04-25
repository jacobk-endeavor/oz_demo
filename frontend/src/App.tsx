import { useEffect, useState, type ReactNode } from 'react'
import { AppShell } from './shared/ui/AppShell'
import {
  Button,
  OzOrb,
  OzWorkflowShell,
  ozWorkflowNavItems,
  type OzWorkflowNavId,
} from './shared/ui'
import { TabBar, type TabDef } from './shared/ui/TabBar'
import { ChatIcon, GraphIcon, UploadIcon } from './shared/ui/icons'
import { ChatPage } from './features/chat/ChatPage'
import { GraphPage } from './features/graph/GraphPage'
import { IngestPage } from './features/ingest/IngestPage'
import { FieldNotesPage } from './features/fieldNotes'
import { CallMiningPage } from './features/callMining'
import { DashboardGeneratorPage } from './features/dashboardGenerator'
import { QuoteAutomationWorkspace } from './features/quoteAutomation'
import { LeadGenerationScreen, ReportingScreen } from './features/leadsReports'

type LegacyPage = 'chat' | 'graph' | 'ingest'
export type Page = OzWorkflowNavId | LegacyPage

const legacyPages = new Set<Page>(['chat', 'graph', 'ingest'])
const workflowPages = new Set<string>(ozWorkflowNavItems.map((item) => item.id))

interface WorkflowPageCopy {
  title: string
  subtitle: string
  eyebrow?: string
}

const workflowCopy: Record<OzWorkflowNavId, WorkflowPageCopy> = {
  oz: {
    eyebrow: 'Assistant home',
    title: 'Oz voice command center',
    subtitle:
      'Start with a voice-first assistant surface, then send the command into Nebula workflows.',
  },
  nebula: {
    eyebrow: 'Workflow hub',
    title: 'Nebula sales operating layer',
    subtitle:
      'Choose the point solution Oz should run across notes, calls, dashboards, quotes, leads, and reports.',
  },
  'field-notes': {
    title: 'Field Notes',
    subtitle: 'Capture messy rep context and turn it into sharper follow-up questions.',
  },
  'call-mining': {
    title: 'Call Mining',
    subtitle: 'Mine calls, emails, and notes for product demand, complaints, and competitor pressure.',
  },
  dashboards: {
    title: 'Dashboards',
    subtitle: 'Generate sales intelligence dashboards from plain-language requests and source data.',
  },
  'quote-automation': {
    title: 'Quote Automation',
    subtitle: 'Review specs, assumptions, and pricing evidence before sending an 80%-complete quote.',
  },
  'lead-generation': {
    title: 'Lead Generation',
    subtitle: 'Find lookalike accounts near tomorrow’s route and convert them into concrete visits.',
  },
  reports: {
    title: 'Reports',
    subtitle: 'Turn Oz insight into a recurring sales digest with delivery status and next actions.',
  },
}

function isLegacyPage(page: Page): page is LegacyPage {
  return legacyPages.has(page)
}

function isWorkflowPage(page: Page): page is OzWorkflowNavId {
  return workflowPages.has(page)
}

// Exported for routing tests; App remains the only component export in this file.
// eslint-disable-next-line react-refresh/only-export-components
export function getHashPage(): Page {
  const hashPath = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  if (hashPath === '') return 'oz'
  if (isWorkflowPage(hashPath as Page) || isLegacyPage(hashPath as Page)) {
    return hashPath as Page
  }
  return 'oz'
}

/**
 * Minimal hash router hook.
 * Returns the active page derived from window.location.hash and keeps it
 * in sync with hashchange events.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useHashRoute(): [Page, (p: Page) => void] {
  const [page, setPage] = useState<Page>(getHashPage)

  useEffect(() => {
    function onHashChange() {
      setPage(getHashPage())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function navigate(p: Page) {
    setPage(p)
    window.location.hash = `#/${p}`
  }

  return [page, navigate]
}

function OzHome({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-3xl border border-[#23B8FF]/25 bg-[#0674FF]/10 p-6">
        <OzOrb state="speaking" size="lg" label="Oz is ready" />
        <h3 className="mt-6 text-2xl font-semibold text-white">
          “Find the next best sales action.”
        </h3>
        <p className="mt-3 text-sm leading-6 text-[#B7C1D8]">
          Oz keeps the voice metaphor front and center, but every scripted prompt can run without a
          microphone so the live demo remains reliable.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => onNavigate('field-notes')}>Run field note script</Button>
          <Button variant="secondary" onClick={() => onNavigate('nebula')}>
            Open Nebula
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {[
          'Capture customer visit context',
          'Mine scattered interaction evidence',
          'Generate dashboards, quotes, leads, and reports',
        ].map((item, index) => (
          <article key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="font-mono text-xs text-[#23B8FF]">0{index + 1}</p>
            <h4 className="mt-2 text-lg font-semibold text-white">{item}</h4>
            <p className="mt-2 text-sm leading-6 text-[#8B93A7]">
              Oz turns raw sales data into a visible Nebula workflow with cited evidence and a
              concrete next action.
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

function NebulaHub({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const cards: Array<{
    page: OzWorkflowNavId
    title: string
    question: string
    output: string
  }> = [
    {
      page: 'call-mining',
      title: 'Mine calls for demand',
      question: 'What are customers asking for?',
      output: 'Ranked demand, complaints, competitors, and rep actions.',
    },
    {
      page: 'dashboards',
      title: 'Generate dashboard',
      question: 'What should the sales leader see?',
      output: 'A generated dashboard with Q&A and source-backed modules.',
    },
    {
      page: 'quote-automation',
      title: 'Build pricing quote',
      question: 'Can Oz draft the first 80%?',
      output: 'Quote lines, assumptions, source references, and review controls.',
    },
    {
      page: 'lead-generation',
      title: 'Find similar customers',
      question: 'Who should the rep visit next?',
      output: 'Lookalike accounts, route order, talking points, and product angles.',
    },
    {
      page: 'reports',
      title: 'Prepare weekly report',
      question: 'How does this become a recurring process?',
      output: 'Digest preview, recipients, cadence, and delivery status.',
    },
  ]

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {cards.map((card) => (
        <article key={card.page} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#23B8FF]">
            {card.question}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">{card.title}</h3>
          <p className="mt-3 text-sm leading-6 text-[#B7C1D8]">{card.output}</p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#8B93A7]">
              8-24 sources · 3 min saved
            </span>
            <Button variant="secondary" onClick={() => onNavigate(card.page)}>
              Open
            </Button>
          </div>
        </article>
      ))}
    </section>
  )
}

export default function App() {
  const [page, navigate] = useHashRoute()

  const legacyTabs: TabDef<LegacyPage>[] = [
    { id: 'chat', label: 'Chat', icon: <ChatIcon className="h-4 w-4" /> },
    { id: 'graph', label: 'Graph', icon: <GraphIcon className="h-4 w-4" /> },
    { id: 'ingest', label: 'Ingest', icon: <UploadIcon className="h-4 w-4" /> },
  ]

  if (isLegacyPage(page)) {
    const isFullBleed = page === 'chat'

    return (
      <AppShell activePage={page} onPageChange={navigate} fullBleed={isFullBleed}>
        <TabBar tabs={legacyTabs} active={page} onChange={navigate} fullBleed={isFullBleed} />
        {page === 'chat' && <ChatPage />}
        {page === 'graph' && <GraphPage />}
        {page === 'ingest' && <IngestPage />}
      </AppShell>
    )
  }

  const copy = workflowCopy[page]
  let workflowBody: ReactNode = null
  if (page === 'oz') workflowBody = <OzHome onNavigate={navigate} />
  if (page === 'nebula') workflowBody = <NebulaHub onNavigate={navigate} />
  if (page === 'field-notes') workflowBody = <FieldNotesPage />
  if (page === 'call-mining') workflowBody = <CallMiningPage />
  if (page === 'dashboards') workflowBody = <DashboardGeneratorPage />
  if (page === 'quote-automation') workflowBody = <QuoteAutomationWorkspace />
  if (page === 'lead-generation') {
    workflowBody = <LeadGenerationScreen onAddToReport={() => navigate('reports')} />
  }
  if (page === 'reports') workflowBody = <ReportingScreen />

  return (
    <OzWorkflowShell
      activeNavItem={page}
      onNavItemChange={navigate}
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={copy.subtitle}
    >
      {workflowBody}
    </OzWorkflowShell>
  )
}
