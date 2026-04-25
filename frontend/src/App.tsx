import { useEffect, useState, type ReactNode } from 'react'
import { OzWorkflowShell } from './shared/ui'
import { ChatPage } from './features/chat/ChatPage'
import { GraphPage } from './features/graph/GraphPage'
import { IngestPage } from './features/ingest/IngestPage'
import { OzHomePage } from './features/oz/OzHomePage'
import { NebulaHubPage } from './features/oz/NebulaHubPage'
import { FieldNotesPage } from './features/fieldNotes'
import { CallMiningPage } from './features/callMining'
import { DashboardGeneratorPage } from './features/dashboardGenerator'
import { QuoteAutomationWorkspace } from './features/quoteAutomation'
import { LeadGenerationScreen, ReportingScreen } from './features/leadsReports'

type LegacyPage = 'chat' | 'graph' | 'ingest'
type WorkflowPage =
  | 'oz'
  | 'nebula'
  | 'field-notes'
  | 'call-mining'
  | 'dashboards'
  | 'quote-automation'
  | 'lead-generation'
  | 'reports'
export type Page = WorkflowPage | LegacyPage

const legacyPages = new Set<Page>(['chat', 'graph', 'ingest'])
const allPages = new Set<Page>([
  'oz',
  'nebula',
  'field-notes',
  'call-mining',
  'dashboards',
  'quote-automation',
  'lead-generation',
  'reports',
  'chat',
  'graph',
  'ingest',
])

interface PageMeta {
  title: string
  subtitle?: string
  eyebrow?: string
}

const pageMeta: Record<Page, PageMeta> = {
  oz: {
    eyebrow: 'Assistant home',
    title: 'Oz',
    subtitle: 'Voice-first sales assistant. Ask for the next sales action.',
  },
  nebula: {
    eyebrow: 'Workflow hub',
    title: 'Nebula',
    subtitle: 'Pick a workflow Oz should run across notes, calls, dashboards, quotes, leads, and reports.',
  },
  'field-notes': {
    title: 'Field Notes',
    subtitle: 'Turn messy visit context into sharper next questions and product recommendations.',
  },
  'call-mining': {
    title: 'Call Mining',
    subtitle: 'Mine calls, emails, and notes for product demand, complaints, and competitor pressure.',
  },
  dashboards: {
    title: 'Dashboards',
    subtitle: 'Generate a sales intelligence dashboard from a plain-language prompt.',
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
    subtitle: 'Turn an Oz insight into a recurring sales digest with delivery status and next actions.',
  },
  chat: {
    eyebrow: 'Legacy',
    title: 'Chat',
    subtitle: 'Conversational interface for the original ECL knowledge base.',
  },
  graph: {
    eyebrow: 'Legacy',
    title: 'Knowledge Graph',
    subtitle: 'Force-directed exploration of indexed entities and relationships.',
  },
  ingest: {
    eyebrow: 'Legacy',
    title: 'Ingest',
    subtitle: 'Drop documents into the knowledge base.',
  },
}

function isLegacyPage(page: Page): page is LegacyPage {
  return legacyPages.has(page)
}

function isPage(value: string): value is Page {
  return allPages.has(value as Page)
}

// eslint-disable-next-line react-refresh/only-export-components
export function getHashPage(): Page {
  const hashPath = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  if (hashPath === '') return 'oz'
  return isPage(hashPath) ? hashPath : 'oz'
}

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

export default function App() {
  const [page, navigate] = useHashRoute()
  const meta = pageMeta[page]

  let body: ReactNode = null
  if (page === 'oz') body = <OzHomePage onNavigate={(target) => navigate(target as Page)} />
  if (page === 'nebula') body = <NebulaHubPage onNavigate={(target) => navigate(target as Page)} />
  if (page === 'field-notes') body = <FieldNotesPage />
  if (page === 'call-mining') body = <CallMiningPage />
  if (page === 'dashboards') body = <DashboardGeneratorPage />
  if (page === 'quote-automation') body = <QuoteAutomationWorkspace />
  if (page === 'lead-generation') {
    body = <LeadGenerationScreen onAddToReport={() => navigate('reports')} />
  }
  if (page === 'reports') body = <ReportingScreen />
  if (page === 'chat') body = <ChatPage />
  if (page === 'graph') body = <GraphPage />
  if (page === 'ingest') body = <IngestPage />

  const isFullBleed = page === 'chat'
  const hideAssistant = isLegacyPage(page)

  return (
    <OzWorkflowShell
      activeNavItem={page}
      onNavItemChange={(id) => navigate(id as Page)}
      eyebrow={meta.eyebrow}
      title={meta.title}
      subtitle={meta.subtitle}
      fullBleed={isFullBleed}
      hideAssistant={hideAssistant}
      assistantProps={{
        contextSummary: meta.subtitle ?? '',
        messages: [
          {
            id: 'oz-intro',
            role: 'oz',
            content: 'Pick a workflow on the left, or ask me what to do next.',
          },
        ],
        suggestedPrompts: [
          { id: 'next-action', label: 'What is the next sales action?' },
          { id: 'top-products', label: 'Top requested products this week?' },
        ],
      }}
    >
      {body}
    </OzWorkflowShell>
  )
}
