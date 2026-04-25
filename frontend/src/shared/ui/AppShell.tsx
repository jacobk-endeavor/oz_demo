import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

type Page = 'chat' | 'graph' | 'ingest'

interface AppShellProps {
  activePage: Page
  onPageChange: (page: Page) => void
  children: ReactNode
  /**
   * When true, the main area renders without the rounded-card wrapper
   * and fills the viewport edge-to-edge.  Used by the Chat tab so the
   * composer sits flush at the bottom and the message list has the
   * full available height.
   */
  fullBleed?: boolean
}

export function AppShell({ activePage, onPageChange, children, fullBleed }: AppShellProps) {
  return (
    <div className="flex h-screen">
      <Sidebar activePage={activePage} onPageChange={onPageChange} />
      <main className="flex-1 overflow-hidden">
        {fullBleed ? (
          <div className="flex h-full flex-col bg-white">{children}</div>
        ) : (
          <div className="m-4 overflow-auto rounded-xl bg-white p-6 shadow-xl shadow-black/5">
            {children}
          </div>
        )}
      </main>
    </div>
  )
}
