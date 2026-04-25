import { useEffect, useState, useCallback } from 'react'
import { api } from '../../shared/api/client'

export interface ConversationSummary {
  session_id: string
  title: string
  updated_at: string
  started_at: string
}

interface Props {
  activeSessionId: string | null
  onSelect: (sessionId: string) => void
  onNewChat: () => void
  /** Incremented by the parent after a message round-trip so the
      sidebar refetches and picks up title/updated_at changes. */
  refreshToken: number
}

function formatRelative(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const delta = Date.now() - d.getTime()
  const mins = Math.floor(delta / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

/**
 * Left-hand history rail inside the Chat tab.
 *
 * Mirrors Claude.ai's conversation list: recent conversations, a
 * "New chat" button, clickable rows to switch sessions.
 */
export function ConversationSidebar({
  activeSessionId,
  onSelect,
  onNewChat,
  refreshToken,
}: Props) {
  const [items, setItems] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ sessions: ConversationSummary[] }>(
        '/api/chat/sessions',
      )
      setItems(res.sessions)
    } catch {
      // Non-fatal — sidebar empty on load failure.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Conversations
        </span>
        <button
          type="button"
          onClick={onNewChat}
          className="rounded-md bg-blue-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600"
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && items.length === 0 ? (
          <div className="px-2 py-3 text-xs text-zinc-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-3 text-xs text-zinc-400">
            No saved conversations yet. Send a message to start one.
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((c) => {
              const isActive = c.session_id === activeSessionId
              return (
                <li key={c.session_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.session_id)}
                    className={[
                      'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left transition-colors',
                      isActive
                        ? 'bg-white shadow-sm ring-1 ring-zinc-200'
                        : 'hover:bg-white',
                    ].join(' ')}
                  >
                    <span className="line-clamp-2 text-sm text-zinc-800">
                      {c.title || 'New conversation'}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {formatRelative(c.updated_at || c.started_at)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
