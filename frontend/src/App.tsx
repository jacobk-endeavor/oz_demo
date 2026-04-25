import { useState, useEffect } from 'react'
import { AppShell } from './shared/ui/AppShell'
import { TabBar, type TabDef } from './shared/ui/TabBar'
import { ChatIcon, GraphIcon, UploadIcon } from './shared/ui/icons'
import { ChatPage } from './features/chat/ChatPage'
import { GraphPage } from './features/graph/GraphPage'
import { IngestPage } from './features/ingest/IngestPage'

export type Page = 'chat' | 'graph' | 'ingest'

export function getHashPage(): Page {
  const hash = window.location.hash
  if (hash === '#/graph' || hash.startsWith('#/graph?')) return 'graph'
  if (hash === '#/ingest') return 'ingest'
  return 'chat'
}

/**
 * Minimal hash router hook.
 * Returns the active page derived from window.location.hash and keeps it
 * in sync with hashchange events.
 */
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
    window.location.hash = `#/${p}`
  }

  return [page, navigate]
}

export default function App() {
  const [page, navigate] = useHashRoute()

  // TODO(T105 citation-pill → graph deep-link):
  // Pass onCitationClick to ChatPage once ChatPage accepts the prop.
  // Implementation sketch:
  //   function handleCitationClick(citation: Citation) {
  //     window.location.hash = `#/graph?focus=${encodeURIComponent(citation.id)}`
  //   }
  //   <ChatPage onCitationClick={handleCitationClick} />
  // GraphPage should read `new URLSearchParams(window.location.hash.split('?')[1]).get('focus')`
  // on mount to highlight/centre the focused node.
  // Requires: ChatPage.tsx (T102) to accept + thread onCitationClick down to CitationPill.
  // Requires: GraphPage.tsx (T103) to read the focus param and call graphRef.current?.centerAt.

  const tabs: TabDef<Page>[] = [
    { id: 'chat', label: 'Chat', icon: <ChatIcon className="h-4 w-4" /> },
    { id: 'graph', label: 'Graph', icon: <GraphIcon className="h-4 w-4" /> },
    { id: 'ingest', label: 'Ingest', icon: <UploadIcon className="h-4 w-4" /> },
  ]

  // Chat is full-bleed by default — composer flush to bottom, messages
  // fill the viewport.  Graph + Ingest keep the zinc-background card
  // look.
  const isFullBleed = page === 'chat'

  return (
    <AppShell activePage={page} onPageChange={navigate} fullBleed={isFullBleed}>
      <TabBar tabs={tabs} active={page} onChange={navigate} fullBleed={isFullBleed} />
      {page === 'chat' && <ChatPage />}
      {page === 'graph' && <GraphPage />}
      {page === 'ingest' && <IngestPage />}
    </AppShell>
  )
}
