import { ChatIcon, GraphIcon, UploadIcon, PanelRightIcon } from './icons'

type Page = 'chat' | 'graph' | 'ingest'

interface SidebarProps {
  activePage: Page
  onPageChange: (page: Page) => void
}

function navClass(isActive: boolean): string {
  return [
    'flex w-full items-center gap-2 rounded-lg p-2 text-sm font-medium transition-colors',
    isActive ? 'bg-white/10 text-zinc-100' : 'text-zinc-300 hover:bg-white/10',
  ].join(' ')
}

export function Sidebar({ activePage, onPageChange }: SidebarProps) {
  return (
    <nav className="w-[240px] flex-shrink-0 bg-zinc-950 min-h-screen flex flex-col">
      <div className="px-3 py-4 flex items-center justify-between">
        <span className="text-zinc-100 font-semibold text-lg tracking-wide ml-1">ECL</span>
        <button
          type="button"
          className="rounded-lg p-2 text-zinc-300 hover:bg-white/10 transition-colors"
          title="Collapse sidebar"
        >
          <PanelRightIcon className="h-5 w-5 text-zinc-300/80" />
        </button>
      </div>
      <div className="px-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onPageChange('chat')}
          className={navClass(activePage === 'chat')}
          aria-current={activePage === 'chat' ? 'page' : undefined}
        >
          <ChatIcon className="h-4 w-4 flex-shrink-0 text-zinc-400" />
          <span>Chat</span>
        </button>
        <button
          type="button"
          onClick={() => onPageChange('graph')}
          className={navClass(activePage === 'graph')}
          aria-current={activePage === 'graph' ? 'page' : undefined}
        >
          <GraphIcon className="h-4 w-4 flex-shrink-0 text-zinc-400" />
          <span>Graph</span>
        </button>
        <button
          type="button"
          onClick={() => onPageChange('ingest')}
          className={navClass(activePage === 'ingest')}
          aria-current={activePage === 'ingest' ? 'page' : undefined}
        >
          <UploadIcon className="h-4 w-4 flex-shrink-0 text-zinc-400" />
          <span>Ingest</span>
        </button>
      </div>
    </nav>
  )
}
